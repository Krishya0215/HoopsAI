import React, { useState, useRef, useEffect } from 'react';
import { AgentChat } from './components/AgentChat';
import { VideoPlayer } from './components/VideoPlayer';
import { EventTimeline } from './components/EventTimeline';
import { analyzeBasketballVideo, fileToGenerativePart, generateAudioCommentary, generateCommentaryScript } from './services/gemini';
import { decode, decodeAudioData } from './services/audioUtils';
import { AgentMessage, AppState, VideoEvent, VideoFilter } from './types';

const FILTERS: VideoFilter[] = [
  { name: 'Normal', cssFilter: 'none' },
  { name: 'High Contrast', cssFilter: 'contrast(1.4) saturate(1.2)' },
  { name: 'Vintage', cssFilter: 'sepia(0.6) contrast(1.1)', overlayColor: 'rgba(255, 230, 200, 0.2)' },
  { name: 'Broadcast', cssFilter: 'saturate(1.3) brightness(1.1)', overlayColor: 'rgba(0,0,255,0.05)' },
  { name: 'Noir', cssFilter: 'grayscale(1) contrast(1.2)' },
];

export default function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([
    { id: '1', role: 'agent', content: 'Welcome to HoopsAI. Upload a game clip to analyze player movements, detect highlights, and generate commentary.', timestamp: new Date() }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFilter, setCurrentFilter] = useState<VideoFilter>(FILTERS[0]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Cleanup URL on unmount
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [videoUrl]);

  const addMessage = (role: 'agent' | 'user' | 'system', content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date()
    }]);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert("Please upload a smaller video (< 20MB) for this browser-based demo.");
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFile(file);
    setEvents([]); // Reset events
    addMessage('user', `Uploaded video: ${file.name}`);
    addMessage('agent', "Video loaded! I can now analyze the footage for dunks, steals, and scoring plays. Click 'Analyze Video' to start.");
  };

  const handleAnalyze = async () => {
    if (!videoFile) return;
    
    setIsProcessing(true);
    addMessage('user', 'Analyze this footage.');
    addMessage('agent', 'Watching the tape... Identifying key basketball events...');

    try {
      const base64Data = await fileToGenerativePart(videoFile);
      const detectedEvents = await analyzeBasketballVideo(base64Data, videoFile.type);
      
      // Sort events by time
      detectedEvents.sort((a, b) => a.startTime - b.startTime);
      
      // Add unique IDs
      const eventsWithIds = detectedEvents.map((e, i) => ({ ...e, id: `evt-${i}` }));
      
      setEvents(eventsWithIds);
      
      const counts = eventsWithIds.reduce((acc, curr) => {
        acc[curr.type] = (acc[curr.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const summary = Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(', ');
      
      addMessage('agent', `Analysis complete! I found: ${summary}. You can click on the timeline to jump to highlights.`);
    } catch (error) {
      console.error(error);
      addMessage('agent', 'Sorry, I encountered an error analyzing the video. Please try a shorter clip.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateCommentary = async () => {
    if (events.length === 0) return;

    setIsProcessing(true);
    addMessage('user', 'Generate AI Commentary.');
    addMessage('agent', 'Drafting a script and synthesizing voice...');

    try {
      // 1. Generate Script
      const script = await generateCommentaryScript(events);
      addMessage('agent', `Script: "${script}"`);

      // 2. TTS
      const audioBase64 = await generateAudioCommentary(script);
      
      if (audioBase64) {
        addMessage('agent', 'Playing commentary audio...');
        playAudio(audioBase64);
      } else {
        addMessage('agent', 'Could not generate audio at this time.');
      }

    } catch (error) {
      console.error(error);
      addMessage('agent', 'Error generating commentary.');
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBytes = decode(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlayingAudio(false);
      
      setIsPlayingAudio(true);
      source.start(0);
    } catch (e) {
      console.error("Audio playback error", e);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex overflow-hidden">
      {/* Sidebar - Controls & Info */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col p-6 gap-6 shadow-xl z-20">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-700 rounded-full flex items-center justify-center shadow-lg">
                 <span className="text-xl font-bold text-white">H</span>
            </div>
            <h1 className="text-3xl font-sport tracking-wide text-white">Hoops<span className="text-orange-500">AI</span></h1>
        </div>

        <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Media</h3>
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-medium"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Video
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="video/*" 
                onChange={handleFileUpload}
            />
        </div>

        <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold">AI Actions</h3>
            <button 
                onClick={handleAnalyze}
                disabled={!videoUrl || isProcessing}
                className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-bold shadow-lg 
                    ${!videoUrl || isProcessing ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white'}`}
            >
               {isProcessing ? 'Processing...' : 'Analyze Highlights'}
            </button>
            
            <button 
                onClick={handleGenerateCommentary}
                disabled={events.length === 0 || isProcessing}
                className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-bold shadow-lg
                    ${events.length === 0 || isProcessing ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white'}`}
            >
                Generate Commentary
            </button>
        </div>

        <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Visual FX</h3>
            <div className="grid grid-cols-2 gap-2">
                {FILTERS.map(filter => (
                    <button
                        key={filter.name}
                        onClick={() => setCurrentFilter(filter)}
                        className={`p-2 rounded text-xs border transition-all ${currentFilter.name === filter.name ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                    >
                        {filter.name}
                    </button>
                ))}
            </div>
        </div>

        {events.length > 0 && (
             <div className="flex-1 overflow-auto space-y-2 pr-1">
                <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Clip List</h3>
                {events.map((evt) => (
                    <div 
                        key={evt.id} 
                        onClick={() => handleSeek(evt.startTime)}
                        className="p-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded cursor-pointer group transition-colors"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                                evt.type === 'DUNK' ? 'bg-orange-600' : 
                                evt.type === '3POINT' ? 'bg-blue-600' : 'bg-slate-600'
                            }`}>
                                {evt.type}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                                {Math.floor(evt.startTime)}s - {Math.floor(evt.endTime)}s
                            </span>
                        </div>
                        <p className="text-xs text-slate-300 truncate">{evt.description}</p>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
         {/* Top Bar */}
         <div className="h-16 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between px-6 z-10">
            <div className="text-sm font-medium text-slate-400">
                Project: {videoFile?.name || 'Untitled Project'}
            </div>
            {isPlayingAudio && (
                <div className="flex items-center gap-2 text-orange-400 animate-pulse text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    AI Commentary Playing
                </div>
            )}
         </div>

         {/* Workspace */}
         <div className="flex-1 flex overflow-hidden">
            {/* Stage */}
            <div className="flex-1 bg-[#020617] p-8 flex flex-col justify-center relative">
                <div className="max-w-5xl w-full mx-auto">
                    <VideoPlayer 
                        videoUrl={videoUrl}
                        currentFilter={currentFilter}
                        videoRef={videoRef}
                        onTimeUpdate={setCurrentTime}
                        onDurationChange={setDuration}
                    />
                    <EventTimeline 
                        duration={duration}
                        events={events}
                        currentTime={currentTime}
                        onSeek={handleSeek}
                    />
                </div>
            </div>
            
            {/* Right Panel: Agent Chat */}
            <div className="w-80 h-full border-l border-slate-800 bg-slate-900">
                <AgentChat messages={messages} isProcessing={isProcessing} />
            </div>
         </div>
      </div>
    </div>
  );
}