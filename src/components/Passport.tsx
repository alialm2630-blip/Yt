import React from "react";
import { TravelSession } from "../types";
import { Calendar, Trash2, MapPin, Compass, Award } from "lucide-react";

interface PassportProps {
  sessions: TravelSession[];
  onSelect: (session: TravelSession) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  currentActiveId?: string;
}

export default function Passport({ sessions, onSelect, onDelete, onClearAll, currentActiveId }: PassportProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center space-y-4" id="passport-empty-container">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 border border-slate-100">
          <Compass className="h-6 w-6 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">Your Traveler Passport is Empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Take or upload a photo of a global monument to get started. Your travel stamp collection will gather here!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="traveler-passport-container">
      {/* Passport Header controls */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <Award className="h-4.5 w-4.5 text-sky-500" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest font-mono">
            Travel Stamp Passport ({sessions.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
        >
          Reset Passport
        </button>
      </div>

      {/* Grid of Stamps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {sessions.map((session) => {
          const isActive = session.id === currentActiveId;
          const dateStr = new Date(session.timestamp).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={session.id}
              id={`passport-stamp-${session.id}`}
              onClick={() => onSelect(session)}
              className={`relative overflow-hidden rounded-2xl border bg-white p-3 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group flex flex-col justify-between ${
                isActive
                  ? "border-sky-500 ring-2 ring-sky-500/15 scale-[1.01]"
                  : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="space-y-3">
                {/* Photo Thumbnail */}
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={session.image}
                    alt={session.analysis.landmarkName}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Decorative stamp stamp overlay */}
                  <div className="absolute top-2 right-2 rounded bg-slate-900/75 backdrop-blur-sm px-2 py-0.5 text-[9px] font-mono text-slate-300 uppercase tracking-wider">
                    {session.analysis.approxCoords.split(",")[0]}
                  </div>
                </div>

                {/* Stamp Metadata details */}
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-sky-600 transition-colors line-clamp-1">
                    {session.analysis.landmarkName}
                  </h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="truncate">{session.analysis.location}</span>
                  </p>
                </div>
              </div>

              {/* Stamp Footer controls */}
              <div className="flex items-center justify-between border-t border-slate-50 pt-2.5 mt-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1 font-mono font-medium">
                  <Calendar className="h-3 w-3" /> {dateStr}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  className="rounded p-1.5 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Remove Stamp"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
