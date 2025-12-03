import React, { useState, useRef, useEffect } from 'react';
import { AgentChat } from './components/AgentChat';
import { VideoPlayer } from './components/VideoPlayer';
import { EventTimeline } from './components/EventTimeline';
import { analyzeBasketballVideo, fileToGenerativePart, generateAudioCommentary, generateCommentaryScript, createChatSession } from './services/gemini';
import { decode, decodeAudioData } from './services/audioUtils';
import { AgentMessage, AppState, VideoEvent, VideoFilter } from './types';
import { Chat } from '@google/genai';

const FILTERS: VideoFilter[] = [
  { name: '原片 (Normal)', cssFilter: 'none' },
  { name: '高对比 (High Contrast)', cssFilter: 'contrast(1.4) saturate(1.2)' },
  { name: '复古 (Vintage)', cssFilter: 'sepia(0.6) contrast(1.1)', overlayColor: 'rgba(255, 230, 200, 0.2)' },
  { name: '转播 (Broadcast)', cssFilter: 'saturate(1.3) brightness(1.1)', overlayColor: 'rgba(0,0,255,0.05)' },
  { name: '黑白 (Noir)', cssFilter: 'grayscale(1) contrast(1.2)' },
];

export default function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([
    { id: '1', role: 'agent', content: '欢迎使用 HoopsAI。上传比赛视频，我将为您分析球员动作、检测精彩瞬间并生成专业解说。', timestamp: new Date() }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFilter, setCurrentFilter] = useState<VideoFilter>(FILTERS[0]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  // Audio State
  const [generatedAudioBuffer, setGeneratedAudioBuffer] = useState<AudioBuffer | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chatSessionRef = useRef<Chat | null>(null);

  useEffect(() => {
    // Initialize Chat
    chatSessionRef.current = createChatSession();

    // Cleanup URL on unmount
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

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

    // Limit set to 10MB to be safe with Gemini API inline data limits (approx 20MB payload)
    if (file.size > 10 * 1024 * 1024) {
      alert("为了确保 AI 分析稳定，请上传小于 10MB 的视频片段。");
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFile(file);
    setEvents([]); 
    setGeneratedAudioBuffer(null);
    addMessage('user', `已上传视频: ${file.name}`);
    addMessage('agent', "视频加载成功！我现在可以分析视频中的扣篮、抢断和得分回合。点击“智能分析”开始。");
  };

  const handleChat = async (text: string) => {
    if (!chatSessionRef.current) return;
    addMessage('user', text);
    setIsProcessing(true);
    
    try {
      const response = await chatSessionRef.current.sendMessage({ message: text });
      addMessage('agent', response.text);
    } catch (e) {
      console.error(e);
      addMessage('agent', "抱歉，我现在无法回答。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!videoFile) return;
    
    setIsProcessing(true);
    addMessage('user', '开始智能分析。');
    addMessage('agent', '正在看录像... 识别关键篮球事件中...');

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

      const summary = Object.entries(counts).map(([type, count]) => `${count}个${type}`).join(', ');
      
      // Provide context to the Chat Session
      if (chatSessionRef.current) {
        await chatSessionRef.current.sendMessage({ 
            message: `系统提示：视频分析完成。结果如下：${JSON.stringify(eventsWithIds)}。请根据这些信息回答用户后续的问题。` 
        });
      }

      addMessage('agent', `分析完成！我发现了：${summary}。你可以点击时间轴跳转到精彩时刻。`);
    } catch (error) {
      console.error("Analysis failed:", error);
      addMessage('agent', '抱歉，分析视频时出错。这可能是因为视频过长或格式不支持，请尝试较短的片段（建议 1 分钟以内）。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateCommentary = async () => {
    if (events.length === 0) return;

    setIsProcessing(true);
    addMessage('user', '生成 AI 解说。');
    addMessage('agent', '正在撰写解说词并合成语音...');

    try {
      // 1. Generate Script
      const script = await generateCommentaryScript(events);
      addMessage('agent', `解说词: "${script}"`);

      // 2. TTS
      const audioBase64 = await generateAudioCommentary(script);
      
      if (audioBase64) {
        // Prepare Buffer for playback and export
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        const audioBytes = decode(audioBase64);
        const buffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
        setGeneratedAudioBuffer(buffer);

        addMessage('agent', '解说生成完毕，正在播放...');
        playAudioBuffer(buffer);
      } else {
        addMessage('agent', '暂时无法生成音频。');
      }

    } catch (error) {
      console.error(error);
      addMessage('agent', '生成解说时出错。');
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudioBuffer = (buffer: AudioBuffer) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setIsPlayingAudio(false);
    
    setIsPlayingAudio(true);
    source.start(0);
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const handleExportVideo = async () => {
    if (!videoRef.current || events.length === 0 || !generatedAudioBuffer || !audioContextRef.current) {
        alert("请先进行分析并生成解说音频，然后再合成视频。");
        return;
    }

    setIsExporting(true);
    addMessage('agent', '正在合成精彩集锦与 AI 解说，请稍候...');
    
    const video = videoRef.current;
    const originalTime = video.currentTime;
    const originalMuted = video.muted;
    
    try {
        const stream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream();
        const ctx = audioContextRef.current;
        
        // Setup Audio Mixing
        const dest = ctx.createMediaStreamDestination();
        const audioSource = ctx.createBufferSource();
        audioSource.buffer = generatedAudioBuffer;
        audioSource.connect(dest);
        
        // Add Audio track to Video Stream
        // Using only TTS audio for the highlight reel
        const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        const mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9' });
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hoops_ai_highlights_${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            
            // Restore state
            video.currentTime = originalTime;
            video.muted = originalMuted;
            video.pause();
            addMessage('agent', '视频合成完成！已开始下载。');
            setIsExporting(false);
        };

        // Start Recording Procedure
        video.muted = true; // Mute locally to avoid feedback, captureStream tracks should still work for visual
        
        mediaRecorder.start();
        audioSource.start(0);

        // Sequence Playback Logic for Highlights
        const playNextClip = async (index: number) => {
            if (index >= events.length) {
                mediaRecorder.stop();
                return;
            }

            const evt = events[index];
            video.currentTime = evt.startTime;
            
            try {
              await video.play();
            } catch (e) {
              console.error("Autoplay failed during export", e);
            }

            const checkTime = () => {
                if (video.currentTime >= evt.endTime) {
                    video.pause();
                    video.removeEventListener('timeupdate', checkTime);
                    playNextClip(index + 1);
                }
            };
            
            video.addEventListener('timeupdate', checkTime);
        };

        await playNextClip(0);

    } catch (e) {
        console.error("Export failed", e);
        addMessage('agent', '合成失败。浏览器可能不支持某些捕获功能。');
        setIsExporting(false);
        video.currentTime = originalTime;
        video.muted = originalMuted;
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
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold">媒体库 (Media)</h3>
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-medium"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                上传视频
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="video/*" 
                onChange={handleFileUpload}
            />
            <p className="text-[10px] text-slate-500 text-center">建议上传 10MB 以内的 MP4 文件</p>
        </div>

        <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold">AI 功能 (Actions)</h3>
            <button 
                onClick={handleAnalyze}
                disabled={!videoUrl || isProcessing}
                className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-bold shadow-lg 
                    ${!videoUrl || isProcessing ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white'}`}
            >
               {isProcessing ? '处理中...' : '智能分析精彩时刻'}
            </button>
            
            <button 
                onClick={handleGenerateCommentary}
                disabled={events.length === 0 || isProcessing}
                className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-bold shadow-lg
                    ${events.length === 0 || isProcessing ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white'}`}
            >
                生成 AI 解说
            </button>
            
             <button 
                onClick={handleExportVideo}
                disabled={!generatedAudioBuffer || isExporting}
                className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-bold shadow-lg
                    ${!generatedAudioBuffer || isExporting ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white'}`}
            >
                {isExporting ? '合成中...' : '合成并下载视频'}
            </button>
        </div>

        <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold">视觉特效 (FX)</h3>
            <div className="grid grid-cols-2 gap-2">
                {FILTERS.map(filter => (
                    <button
                        key={filter.name}
                        onClick={() => setCurrentFilter(filter)}
                        className={`p-2 rounded text-xs border transition-all ${currentFilter.name === filter.name ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                    >
                        {filter.name.split(' ')[0]}
                    </button>
                ))}
            </div>
        </div>

        {events.length > 0 && (
             <div className="flex-1 overflow-auto space-y-2 pr-1">
                <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">剪辑列表 (Clips)</h3>
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
                项目: {videoFile?.name || '未命名项目'}
            </div>
            {isPlayingAudio && (
                <div className="flex items-center gap-2 text-orange-400 animate-pulse text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    AI 解说播放中
                </div>
            )}
            {isExporting && (
                <div className="flex items-center gap-2 text-green-400 animate-pulse text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
                    视频合成录制中...
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
                <AgentChat 
                  messages={messages} 
                  isProcessing={isProcessing} 
                  onSendMessage={handleChat}
                />
            </div>
         </div>
      </div>
    </div>
  );
}