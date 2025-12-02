import { GoogleGenAI, Type, Modality } from "@google/genai";
import { VideoEvent } from "../types";

// Helper to get base64 from file
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:video/mp4;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeBasketballVideo = async (base64Video: string, mimeType: string): Promise<VideoEvent[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemPrompt = `
    You are an expert basketball video analyst. 
    Analyze the provided video footage. 
    Identify specific basketball events such as Dunks, 3-Pointers, Steals, Blocks, and Assists.
    Return a strict JSON array where each object has:
    - type: The type of event (DUNK, 3POINT, STEAL, BLOCK, ASSIST, HIGHLIGHT, OTHER)
    - startTime: Start time in seconds (number)
    - endTime: End time in seconds (number)
    - description: A short, exciting description of what happened.
    - confidence: A number between 0 and 1.
    
    Focus on the most exciting moments. Merge adjacent events if they are part of the same play.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Video } },
          { text: "Analyze this basketball video and extract highlights." }
        ]
      },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              startTime: { type: Type.NUMBER },
              endTime: { type: Type.NUMBER },
              description: { type: Type.STRING },
              confidence: { type: Type.NUMBER }
            },
            required: ["type", "startTime", "endTime", "description"]
          }
        }
      }
    });

    const jsonText = response.text || "[]";
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error analyzing video:", error);
    throw error;
  }
};

export const generateCommentaryScript = async (events: VideoEvent[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Here is a list of events from a basketball game:
    ${JSON.stringify(events)}

    Write a high-energy, play-by-play sportscaster script summarizing these highlights. 
    Keep it punchy, enthusiastic, and under 100 words. 
    Focus on the "DUNK" and "3POINT" plays.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return response.text || "No commentary generated.";
};

export const generateAudioCommentary = async (text: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, energetic voice
          },
        },
      },
    });
    
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS Error:", error);
    return undefined;
  }
};