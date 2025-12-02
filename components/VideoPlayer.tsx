import React, { useRef, useEffect } from 'react';
import { VideoFilter } from '../types';

interface VideoPlayerProps {
  videoUrl: string | null;
  currentFilter: VideoFilter;
  onTimeUpdate: (currentTime: number) => void;
  onDurationChange: (duration: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoUrl, 
  currentFilter, 
  onTimeUpdate, 
  onDurationChange,
  videoRef 
}) => {
  if (!videoUrl) {
    return (
      <div className="w-full aspect-video bg-slate-900 rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
        <p className="font-medium">No video loaded</p>
        <p className="text-sm mt-2">Upload a basketball clip to begin</p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain transition-all duration-300"
        style={{
          filter: currentFilter.cssFilter,
        }}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onDurationChange={(e) => onDurationChange(e.currentTarget.duration)}
        controls
        playsInline
      />
      
      {/* Overlay for Color Grading Effects */}
      {currentFilter.overlayColor && (
        <div 
          className="absolute inset-0 pointer-events-none mix-blend-overlay z-10"
          style={{ 
            backgroundColor: currentFilter.overlayColor,
            mixBlendMode: currentFilter.blendMode as any || 'overlay'
          }}
        />
      )}
      
      {/* Sporty Branding Overlay */}
      <div className="absolute top-4 right-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="bg-orange-600 text-white px-2 py-1 text-xs font-bold uppercase tracking-widest rounded shadow-lg transform rotate-[-2deg]">
          Hoops AI Cam
        </div>
      </div>
    </div>
  );
};