import { GoogleGenAI, Type, Modality, Chat } from "@google/genai";
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
    你是一位专业的篮球视频分析师。
    分析提供的视频片段。
    识别具体的篮球事件，例如扣篮 (DUNK)、三分球 (3POINT)、抢断 (STEAL)、盖帽 (BLOCK) 和助攻 (ASSIST)。
    返回一个严格的 JSON 数组，每个对象包含：
    - type: 事件类型 (DUNK, 3POINT, STEAL, BLOCK, ASSIST, HIGHLIGHT, OTHER)
    - startTime: 开始时间（秒，数字）
    - endTime: 结束时间（秒，数字）
    - description: 对发生的事情进行简短、激动人心的中文描述。
    - confidence: 0 到 1 之间的数字。
    
    重点关注最精彩的时刻。如果是同一个回合，请合并相邻的事件。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Video } },
          { text: "分析这段篮球视频并提取精彩集锦。" }
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
    以下是一场篮球比赛的事件列表：
    ${JSON.stringify(events)}

    请用中文写一段充满激情、类似电视解说员的逐个回合解说词，总结这些精彩时刻。
    保持简练、热情，字数控制在 100 字以内。
    重点突出 "DUNK"（扣篮）和 "3POINT"（三分）等得分时刻。
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return response.text || "无法生成解说。";
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

// Chat Functionality
export const createChatSession = (): Chat => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: '你是一个乐于助人的篮球 AI 助手。你可以回答关于用户上传视频的问题（当提供上下文时）或者一般的篮球知识。用中文回答，风格要专业且风趣。',
    }
  });
};
