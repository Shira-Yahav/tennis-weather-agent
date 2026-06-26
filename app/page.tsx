"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import * as Tabs from "@radix-ui/react-tabs";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Toast from "@radix-ui/react-toast";
import * as Separator from "@radix-ui/react-separator";
import * as Slider from "@radix-ui/react-slider";
import {
  MapPin, Wind, Thermometer, Droplets, Play,
  Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Zap, Calendar, FileText, Settings, ChevronRight, MessageSquare,
} from "lucide-react";

const TennisMap = dynamic(() => import("@/app/components/TennisMap"), { ssr: false });

interface EventWeather { temp: number; rain: number; wind: number; isBad: boolean }
interface TennisEvent {
  title: string; startTime: string; endTime: string;
  location: { lat: number; lng: number; label: string };
  weather: EventWeather | null;
}
interface LogEntry {
  id: string; timestamp: string; manual: boolean; eventsCount: number;
  events: Array<{ title: string; startTime: string; location: string; weather: EventWeather }>;
  message: string;
}
interface AppConfig { daysForward: number; messagePrefix: string; messageSuffix: string }

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date(); const tom = new Date(today); tom.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tom.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
}

function WeatherBadge({ w }: { w: EventWeather | null }) {
  if (!w) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${w.isBad ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
      {w.isBad ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
      {w.isBad ? "Poor" : "Good"}
    </span>
  );
}

function WeatherPanel({ w, label, startTime }: { w: EventWeather; label: string; startTime: string }) {
  const rainCls = w.rain >= 30 ? "text-red-600" : w.rain >= 15 ? "text-amber-600" : "text-emerald-600";
  const windCls = w.wind >= 20 ? "text-red-600" : w.wind >= 12 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="border-t border-[#C5DDB8] bg-white px-6 py-4 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] text-[#5C7A5C] font-semibold uppercase tracking-widest">Weather at event time</p>
          <p className="text-sm font-bold text-[#1A2B1A]">{label} · {fmtDate(startTime)}, {fmtTime(startTime)}</p>
        </div>
        {w.isBad
          ? <span className="flex items-center gap-1.5 text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold"><AlertTriangle size={13} /> Consider cancelling</span>
          : <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold"><CheckCircle2 size={13} /> Good to play!</span>
        }
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-xl p-3">
          <Thermometer size={22} className="text-orange-500" />
          <span className="text-2xl font-bold text-orange-700">{w.temp}°C</span>
          <span className="text-[10px] text-orange-500 font-semibold uppercase tracking-wider">Temperature</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-xl p-3">
          <Droplets size={22} className={rainCls} />
          <span className={`text-2xl font-bold ${rainCls}`}>{w.rain}%</span>
          <div className="w-full bg-blue-100 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full transition-all ${w.rain >= 30 ? "bg-red-500" : "bg-blue-400"}`} style={{ width: `${Math.min(w.rain, 100)}%` }} />
          </div>
          <span className="text-[10px] text-blue-500 font-semibold uppercase tracking-wider">Rain chance</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl p-3">
          <Wind size={22} className={windCls} />
          <span className={`text-2xl font-bold ${windCls}`}>{w.wind}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${windCls}`}>km/h wind</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [events, setEvents] = useState<TennisEvent[]>([]);
  const [selected, setSelected] = useState<TennisEvent | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<AppConfig>({ daysForward: 7, messagePrefix: "", messageSuffix: "" });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [toast, setToast] = useState({ open: false, message: "", ok: true });
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const showToast = (message: string, ok = true) => setToast({ open: true, message, ok });

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error("Failed");
      setEvents(await res.json());
      setLastRefresh(new Date());
    } catch { showToast("Failed to refresh events", false); }
    finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async () => {
    try { const r = await fetch("/api/logs"); const d = await r.json(); setLogs(Array.isArray(d) ? d : []); } catch {}
  }, []);

  const loadConfig = useCallback(async () => {
    try { const r = await fetch("/api/config"); setConfig(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    loadEvents(); loadLogs(); loadConfig();
    const t = setInterval(loadEvents, 60000);
    return () => clearInterval(t);
  }, [loadEvents, loadLogs, loadConfig]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      showToast(data.message === "No tennis events found" ? "No upcoming tennis events found" : `✓ Sent! ${data.events} event(s) notified`);
      await loadLogs();
    } catch (err) { showToast(String(err), false); }
    finally { setRunning(false); }
  };

  const saveConfig = async (updates: Partial<AppConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    try {
      await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if ("daysForward" in updates) { setLoading(true); await loadEvents(); }
    } catch { showToast("Failed to save settings", false); }
  };

  return (
    <Toast.Provider swipeDirection="right">
      <div className="h-screen flex flex-col bg-[#F0F7EC] font-sans overflow-hidden">

        {/* Header */}
        <header className="bg-[#1B6B2C] text-white px-6 py-3.5 flex items-center justify-between shadow-lg flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎾</span>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-tight">Tennis Weather Agent</h1>
              <p className="text-green-300 text-[11px]">Dashboard & Control Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-green-300 text-xs flex items-center gap-1.5">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Live · {lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button onClick={loadEvents} className="p-2 rounded-lg bg-green-700 hover:bg-green-600 transition-colors" title="Refresh">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={runNow} disabled={running}
              className="flex items-center gap-2 bg-[#D4E534] text-[#1B6B2C] font-bold px-4 py-2 rounded-lg hover:bg-[#c5d82e] transition-colors disabled:opacity-60 text-sm shadow"
            >
              {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
              Run Now
            </button>
          </div>
        </header>

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: events */}
          <div className="w-80 flex-shrink-0 border-r border-[#C5DDB8] bg-white flex flex-col">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-[#1B6B2C]" />
                <span className="font-semibold text-[#1A2B1A] text-sm">Upcoming Practices</span>
              </div>
              <span className="text-[11px] text-[#5C7A5C] bg-[#F0F7EC] px-2 py-0.5 rounded-full border border-[#C5DDB8]">Next {config.daysForward}d</span>
            </div>
            <Separator.Root className="bg-[#E0EDD8] h-px flex-shrink-0" />
            <ScrollArea.Root className="flex-1 overflow-hidden">
              <ScrollArea.Viewport className="h-full w-full">
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-[#5C7A5C] text-sm">
                    <RefreshCw size={15} className="animate-spin mr-2" />Loading...
                  </div>
                ) : events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-[#5C7A5C] text-sm gap-2 p-4 text-center">
                    <Calendar size={28} className="text-[#C5DDB8]" />
                    No tennis events in the next {config.daysForward} days
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {events.map((event, i) => (
                      <button
                        key={i} onClick={() => setSelected(event)}
                        className={`w-full text-left rounded-xl border-2 p-3 transition-all duration-150 ${selected === event ? "border-[#1B6B2C] bg-[#F0F7EC] shadow-md" : "border-[#E0EDD8] bg-white hover:border-[#A8C99A] hover:bg-[#F8FCF5]"}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-[#1B6B2C] font-bold text-sm">{fmtDate(event.startTime)}</span>
                          <WeatherBadge w={event.weather} />
                        </div>
                        <p className="text-[#1A2B1A] font-semibold text-xs leading-tight line-clamp-2 mb-2">{event.title}</p>
                        <div className="flex items-center gap-1 text-xs text-[#5C7A5C] mb-1">
                          <Clock size={10} />{fmtTime(event.startTime)}–{fmtTime(event.endTime)}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[#5C7A5C]">
                          <MapPin size={10} /><span className="truncate">{event.location.label}</span>
                        </div>
                        {event.weather && (
                          <div className="flex items-center gap-3 mt-2 text-xs text-[#5C7A5C]">
                            <span className="flex items-center gap-0.5"><Thermometer size={10} className="text-orange-400" />{event.weather.temp}°C</span>
                            <span className="flex items-center gap-0.5"><Droplets size={10} className="text-blue-400" />{event.weather.rain}%</span>
                            <span className="flex items-center gap-0.5"><Wind size={10} className="text-slate-400" />{event.weather.wind} km/h</span>
                          </div>
                        )}
                        {selected === event && <p className="text-[10px] text-[#1B6B2C] font-semibold mt-1.5 flex items-center gap-0.5"><ChevronRight size={10} />Showing on map</p>}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar orientation="vertical" className="w-1.5 bg-transparent p-px">
                <ScrollArea.Thumb className="bg-[#C5DDB8] rounded-full" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </div>

          {/* Right: map + weather + tabs */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Map */}
            <div className="flex-1 relative min-h-0">
              {selected ? (
                <TennisMap lat={selected.location.lat} lng={selected.location.lng} label={selected.location.label} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#F0F7EC] text-[#5C7A5C]">
                  <MapPin size={44} className="text-[#C5DDB8] mb-3" />
                  <p className="font-semibold text-sm">Select a practice to see its location</p>
                  <p className="text-xs mt-1 text-[#A8C99A]">Click any event on the left panel</p>
                </div>
              )}
            </div>

            {/* Weather panel */}
            {selected?.weather && (
              <WeatherPanel w={selected.weather} label={selected.location.label} startTime={selected.startTime} />
            )}

            {/* Bottom tabs */}
            <div className="flex-shrink-0 border-t border-[#C5DDB8] bg-white" style={{ height: 260 }}>
              <Tabs.Root defaultValue="logs" className="h-full flex flex-col">
                <Tabs.List className="flex border-b border-[#E0EDD8] px-4 bg-[#F8FCF5] flex-shrink-0">
                  {[
                    { value: "logs", icon: <Zap size={13} />, label: "Message Log" },
                    { value: "template", icon: <FileText size={13} />, label: "Message Template" },
                    { value: "schedule", icon: <Settings size={13} />, label: "Schedule" },
                  ].map((tab) => (
                    <Tabs.Trigger key={tab.value} value={tab.value}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-[#5C7A5C] font-semibold border-b-2 border-transparent data-[state=active]:border-[#1B6B2C] data-[state=active]:text-[#1B6B2C] transition-colors"
                    >
                      {tab.icon}{tab.label}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>

                <Tabs.Content value="logs" className="flex-1 overflow-hidden">
                  <ScrollArea.Root className="h-full">
                    <ScrollArea.Viewport className="h-full p-3">
                      {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-[#5C7A5C] text-xs gap-2">
                          <MessageSquare size={20} className="text-[#C5DDB8]" />
                          No messages sent yet. Hit "Run Now" to send the first one.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {logs.map((log) => (
                            <div key={log.id} className="border border-[#E0EDD8] rounded-xl overflow-hidden">
                              <button className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-[#F8FCF5] transition-colors"
                                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${log.manual ? "bg-[#D4E534]" : "bg-[#1B6B2C]"}`} />
                                  <span className="text-xs font-semibold text-[#1A2B1A]">{log.eventsCount} event{log.eventsCount !== 1 ? "s" : ""} notified</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${log.manual ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                                    {log.manual ? "Manual" : "Scheduled"}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#5C7A5C]">
                                  {new Date(log.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </button>
                              {expandedLog === log.id && (
                                <div className="border-t border-[#E0EDD8] bg-[#F8FCF5] px-3 py-2">
                                  {log.events.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] text-[#1A2B1A] mb-0.5">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.weather.isBad ? "bg-red-500" : "bg-emerald-500"}`} />
                                      <span className="font-semibold">{e.title}</span>
                                      <span className="text-[#5C7A5C]">· {fmtTime(e.startTime)} · {e.location} · {e.weather.temp}°C, {e.weather.rain}% rain, {e.weather.wind} km/h</span>
                                    </div>
                                  ))}
                                  <pre className="text-[10px] text-[#1A2B1A] whitespace-pre-wrap bg-white border border-[#E0EDD8] rounded-lg p-2 mt-2 max-h-20 overflow-y-auto">{log.message}</pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea.Viewport>
                  </ScrollArea.Root>
                </Tabs.Content>

                <Tabs.Content value="template" className="flex-1 overflow-auto p-4">
                  <div className="flex gap-4 h-full">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[#5C7A5C] uppercase tracking-wider mb-1.5">Opening line</label>
                      <textarea rows={2} value={config.messagePrefix}
                        onChange={(e) => saveConfig({ messagePrefix: e.target.value })}
                        placeholder="e.g. Hey! Here's your tennis forecast 🎾"
                        className="w-full rounded-lg border border-[#C5DDB8] p-2.5 text-xs text-[#1A2B1A] bg-[#F8FCF5] focus:outline-none focus:ring-2 focus:ring-[#1B6B2C] resize-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[#5C7A5C] uppercase tracking-wider mb-1.5">Closing line</label>
                      <textarea rows={2} value={config.messageSuffix}
                        onChange={(e) => saveConfig({ messageSuffix: e.target.value })}
                        placeholder="e.g. Court reserved under: Shira Y."
                        className="w-full rounded-lg border border-[#C5DDB8] p-2.5 text-xs text-[#1A2B1A] bg-[#F8FCF5] focus:outline-none focus:ring-2 focus:ring-[#1B6B2C] resize-none"
                      />
                    </div>
                    <div className="flex-1 bg-[#F0F7EC] rounded-xl border border-[#C5DDB8] p-3 text-[10px] text-[#5C7A5C]">
                      <p className="font-bold text-[#1B6B2C] mb-1.5">Preview structure</p>
                      {config.messagePrefix && <p className="text-[#1A2B1A] italic mb-1">"{config.messagePrefix}"</p>}
                      <p>🎾 <strong>Tennis [date]</strong></p>
                      <p>Event · time · venue · temp · rain · wind · status</p>
                      {config.messageSuffix && <p className="text-[#1A2B1A] italic mt-1">"{config.messageSuffix}"</p>}
                    </div>
                  </div>
                </Tabs.Content>

                <Tabs.Content value="schedule" className="flex-1 overflow-auto p-4">
                  <div className="flex gap-6">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[#5C7A5C] uppercase tracking-wider mb-2">Days forward to check</label>
                      <div className="flex items-center gap-3">
                        <Slider.Root min={1} max={14} step={1} value={[config.daysForward]}
                          onValueChange={([v]) => saveConfig({ daysForward: v })}
                          className="relative flex items-center select-none touch-none w-full h-5">
                          <Slider.Track className="bg-[#C5DDB8] relative grow rounded-full h-2">
                            <Slider.Range className="absolute bg-[#1B6B2C] rounded-full h-full" />
                          </Slider.Track>
                          <Slider.Thumb className="block w-5 h-5 bg-white border-2 border-[#1B6B2C] shadow-md rounded-full focus:outline-none focus:ring-2 focus:ring-[#1B6B2C]" />
                        </Slider.Root>
                        <span className="text-xl font-bold text-[#1B6B2C] w-7 text-center">{config.daysForward}</span>
                      </div>
                      <p className="text-[10px] text-[#5C7A5C] mt-1.5">Affects dashboard & Run Now. The daily cron always checks tomorrow only.</p>
                    </div>
                    <div className="flex-shrink-0">
                      <label className="block text-[10px] font-bold text-[#5C7A5C] uppercase tracking-wider mb-2">Scheduled daily run</label>
                      <div className="flex items-center gap-2 bg-[#F0F7EC] border border-[#C5DDB8] rounded-xl px-3 py-2.5">
                        <Clock size={15} className="text-[#1B6B2C]" />
                        <div>
                          <p className="text-sm font-bold text-[#1A2B1A]">16:00 Israel time</p>
                          <p className="text-[10px] text-[#5C7A5C]">Every day · checks tomorrow</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#5C7A5C] mt-1.5">To change: update <code className="bg-[#E0EDD8] px-1 rounded">vercel.ts</code> and redeploy.</p>
                    </div>
                  </div>
                </Tabs.Content>
              </Tabs.Root>
            </div>
          </div>
        </div>
      </div>

      <Toast.Root open={toast.open} onOpenChange={(open) => setToast((t) => ({ ...t, open }))} duration={4000}
        className={`fixed bottom-5 right-5 z-50 rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold border ${toast.ok ? "bg-white border-[#C5DDB8] text-[#1B6B2C]" : "bg-white border-red-200 text-red-700"}`}>
        {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <Toast.Description>{toast.message}</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-0 right-0 p-5 z-50" />
    </Toast.Provider>
  );
}
