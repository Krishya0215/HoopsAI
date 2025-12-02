import React from 'react';
import { VideoEvent } from '../types';

interface EventTimelineProps {
  duration: number;
  events: VideoEvent[];
  currentTime: number;
  onSeek: (time: number) => void;
}

const getEventColor = (type: string) => {
  switch (type) {
    case 'DUNK': return 'bg-orange-500';
    case '3POINT': return 'bg-blue-500';
    case 'STEAL': return 'bg-red-500';
    case 'BLOCK': return 'bg-purple-500';
    default: return 'bg-green-500';
  }
};

export const EventTimeline: React.FC<EventTimelineProps> = ({ duration, events, currentTime, onSeek }) => {
  if (duration === 0) return null;

  return (
    <div className="w-full h-24 bg-slate-900 rounded-lg border border-slate-700 relative overflow-hidden mt-4 select-none">
      {/* Time Markers */}
      <div className="absolute top-0 left-0 w-full h-full flex justify-between px-2 text-xs text-slate-500 pointer-events-none">
        <span>00:00</span>
        <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}</span>
      </div>

      {/* Progress Bar Background */}
      <div 
        className="absolute top-8 left-0 right-0 h-8 bg-slate-800 cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percentage = x / rect.width;
          onSeek(percentage * duration);
        }}
      >
        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-1 bg-white z-20 shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-75"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />

        {/* Events */}
        {events.map((event) => {
          const startPercent = (event.startTime / duration) * 100;
          const widthPercent = ((event.endTime - event.startTime) / duration) * 100;
          
          return (
            <div
              key={event.id}
              className={`absolute top-1 bottom-1 ${getEventColor(event.type)} opacity-80 rounded-sm hover:opacity-100 cursor-pointer group z-10`}
              style={{
                left: `${startPercent}%`,
                width: `${Math.max(widthPercent, 1)}%` // Min width for visibility
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(event.startTime);
              }}
              title={`${event.type}: ${event.description}`}
            >
              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] bg-black text-white text-xs p-2 rounded z-30 pointer-events-none">
                <p className="font-bold">{event.type}</p>
                <p className="opacity-80 truncate">{event.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};