"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import * as Tabs from "@radix-ui/react-tabs";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Toast from "@radix-ui/react-toast";
import * as Separator from "@radix-ui/react-separator";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Select from "@radix-ui/react-select";
import {
  MapPin, Wind, Thermometer, Droplets, Play,
  Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Calendar, FileText, Settings, ChevronRight, MessageSquare,
  Check, ChevronDown, ChevronUp, Send, Zap,
} from "lucide-react";

const TennisMap = dynamic(() => import("@/app/components/TennisMap"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

interface EventWeather { temp: number; rain: number; wind: number; isBad: boolean }
interface TennisEvent {
  title: string; startTime: string; endTime: string;
  location: { lat: number; lng: number; label: string };
  weather: EventWeather | null;
}
interface LogEntry {
  id: string; timestamp: string; manual: boolean; status: "success" | "failure";
  eventsCount: number; selectedEvents: number; daysForward: number;
  scheduleHour: number; scheduleMinute: number;
  events: Array<{ title: string; startTime: string; location: string; weather: EventWeather }>;
  message: string; error?: string;
}
interface MessageTemplate { header: string; eventBlock: string; footerGood: string; footerBad: string }
interface AppConfig { messageDaysForward: number; scheduleHour: number; scheduleMinute: number; template: MessageTemplate }

const DEFAULT_TEMPLATE: MessageTemplate = {
  header: "🎾 <b>Tennis — {date}</b>",
  eventBlock: "<b>{title}</b>\n🕐 {time}\n📍 {venue}\n🌡 {temp}°C  🌧 Rain: {rain}%  💨 Wind: {wind} km/h\n{condition}",
  footerGood: "All clear — enjoy your game! 🎾",
  footerBad: "⚠️ <b>Weather is not ideal. Consider cancelling or rescheduling.</b>",
};

const TEMPLATE_VARS = [
  { key: "{date}", desc: "Event date" }, { key: "{title}", desc: "Event title" },
  { key: "{time}", desc: "Start–end time" }, { key: "{venue}", desc: "Venue name" },
  { key: "{temp}", desc: "Temperature °C" }, { key: "{rain}", desc: "Rain %" },
  { key: "{wind}", desc: "Wind km/h" }, { key: "{condition}", desc: "✅ Good / ⚠️ Bad" },
];

const DASHBOARD_DAY_OPTIONS = [1, 3, 7, 14, 30];

// ── Helpers ──────────────────────────────────────────────────────────────────

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
function pad(n: number) { return String(n).padStart(2, "0"); }

// ── Sub-components ────────────────────────────────────────────────────────────

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
          : <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold"><CheckCircle2 size={13} /> Good to play!</span>}
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
            <div className={`h-1.5 rounded-full ${w.rain >= 30 ? "bg-red-500" : "bg-blue-400"}`} style={{ width: `${Math.min(w.rain, 100)}%` }} />
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

function DigitalClockInput({ hour, minute, onChange }: { hour: number; minute: number; onChange: (h: number, m: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1 bg-[#1A2B1A] rounded-xl px-4 py-3 select-none">
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => onChange((hour + 1) % 24, minute)} className="text-green-400 hover:text-green-300 transition-colors p-0.5"><ChevronUp size={14} /></button>
        <span className="text-2xl font-bold font-mono text-[#D4E534] w-10 text-center leading-none">{pad(hour)}</span>
        <button onClick={() => onChange((hour - 1 + 24) % 24, minute)} className="text-green-400 hover:text-green-300 transition-colors p-0.5"><ChevronDown size={14} /></button>
      </div>
      <span className="text-2xl font-bold text-[#D4E534] pb-0.5">:</span>
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => onChange(hour, (minute + 5) % 60)} className="text-green-400 hover:text-green-300 transition-colors p-0.5"><ChevronUp size={14} /></button>
        <span className="text-2xl font-bold font-mono text-[#D4E534] w-10 text-center leading-none">{pad(minute)}</span>
        <button onClick={() => onChange(hour, (minute - 5 + 60) % 60)} className="text-green-400 hover:text-green-300 transition-colors p-0.5"><ChevronDown size={14} /></button>
      </div>
      <span className="text-xs text-green-400 ml-1 self-center">IL</span>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [events, setEvents] = useState<TennisEvent[]>([]);
  const [dashboardDays, setDashboardDays] = useState(7);
  const [selected, setSelected] = useState<TennisEvent | null>(null);
  // Indices of events checked for sending; defaults to first upcoming event (index 0)
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<AppConfig>({ messageDaysForward: 1, scheduleHour: 16, scheduleMinute: 0, template: DEFAULT_TEMPLATE });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [toast, setToast] = useState({ open: false, message: "", ok: true });
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, ok = true) => setToast({ open: true, message, ok });

  const loadEvents = useCallback(async (days?: number) => {
    const d = days ?? dashboardDays;
    setLoading(true);
    try {
      const res = await fetch(`/api/events?days=${d}`);
      if (!res.ok) throw new Error("Failed");
      const data: TennisEvent[] = await res.json();
      setEvents(data);
      // Default selection: first upcoming event; preserve existing selections if events still exist
      setCheckedIndices(prev => {
        if (prev.size === 0 && data.length > 0) return new Set([0]);
        // Keep indices that still exist
        const next = new Set<number>();
        prev.forEach(i => { if (i < data.length) next.add(i); });
        // If nothing survived, default to first
        if (next.size === 0 && data.length > 0) next.add(0);
        return next;
      });
      // Clear selected event if it no longer exists
      setSelected(prev => {
        if (!prev) return null;
        const stillExists = data.some(e => e.title === prev.title && e.startTime === prev.startTime);
        return stillExists ? prev : null;
      });
      setLastRefresh(new Date());
    } catch { showToast("Failed to refresh calendar", false); }
    finally { setLoading(false); }
  }, [dashboardDays]);

  const loadLogs = useCallback(async () => {
    try { const r = await fetch("/api/logs"); const d = await r.json(); setLogs(Array.isArray(d) ? d : []); } catch {}
  }, []);

  const loadConfig = useCallback(async () => {
    try { const r = await fetch("/api/config"); const d = await r.json(); setConfig(d); } catch {}
  }, []);

  useEffect(() => {
    loadEvents(); loadLogs(); loadConfig();
    const t = setInterval(() => loadEvents(), 60000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadEvents(dashboardDays); }, [dashboardDays, loadEvents]);

  const saveConfig = async (updates: Partial<AppConfig>) => {
    const next = { ...config, ...updates, template: { ...config.template, ...(updates.template ?? {}) } };
    setConfig(next);
    try {
      await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    } catch { showToast("Failed to save settings", false); }
  };

  const saveSchedule = (updates: Partial<AppConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    setSavingSchedule(true);
    if (scheduleDebounce.current) clearTimeout(scheduleDebounce.current);
    scheduleDebounce.current = setTimeout(async () => {
      try {
        await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        showToast("Schedule saved — redeploying in ~1 min");
      } catch { showToast("Failed to save schedule", false); }
      finally { setSavingSchedule(false); }
    }, 1500);
  };

  const doRun = async () => {
    if (checkedIndices.size === 0) { showToast("No events selected", false); return; }
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndices: Array.from(checkedIndices) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      showToast(data.message === "No tennis events found" ? "No upcoming tennis events" : `✓ Sent ${data.events} event(s)`);
      await loadLogs();
    } catch (err) { showToast(String(err), false); }
    finally { setRunning(false); }
  };

  const toggleCheck = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIndices(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const allChecked = events.length > 0 && checkedIndices.size === events.length;
  const toggleAll = () => setCheckedIndices(allChecked ? new Set() : new Set(events.map((_, i) => i)));

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
                {lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => loadEvents(dashboardDays)}
              className="p-2 rounded-lg bg-green-700 hover:bg-green-600 transition-colors"
              title="Refresh calendar"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={doRun}
              disabled={running || checkedIndices.size === 0}
              className="flex items-center gap-2 bg-[#D4E534] text-[#1B6B2C] font-bold px-4 py-2 rounded-lg hover:bg-[#c5d82e] transition-colors disabled:opacity-60 text-sm shadow"
            >
              {running ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              {checkedIndices.size > 0 ? `Send (${checkedIndices.size})` : "Send"}
            </button>
          </div>
        </header>

        {/* Main */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: events */}
          <div className="w-80 flex-shrink-0 border-r border-[#C5DDB8] bg-white flex flex-col">
            {/* Panel header */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-[#1B6B2C]" />
                <span className="font-semibold text-[#1A2B1A] text-sm">Upcoming Practices</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Select all toggle */}
                {events.length > 0 && (
                  <button onClick={toggleAll} className="text-[10px] text-[#1B6B2C] font-semibold hover:underline">
                    {allChecked ? "Deselect all" : "Select all"}
                  </button>
                )}
                {/* Days filter */}
                <Select.Root value={String(dashboardDays)} onValueChange={(v) => setDashboardDays(Number(v))}>
                  <Select.Trigger className="flex items-center gap-1 text-[11px] text-[#1B6B2C] bg-[#F0F7EC] border border-[#C5DDB8] px-2 py-1 rounded-full font-semibold hover:bg-[#E0EDD8] transition-colors focus:outline-none">
                    <Select.Value />
                    <Select.Icon><ChevronDown size={10} /></Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="bg-white border border-[#C5DDB8] rounded-xl shadow-xl z-50 overflow-hidden">
                      <Select.Viewport className="p-1">
                        {DASHBOARD_DAY_OPTIONS.map(d => (
                          <Select.Item key={d} value={String(d)} className="flex items-center gap-2 px-3 py-2 text-xs text-[#1A2B1A] rounded-lg cursor-pointer hover:bg-[#F0F7EC] focus:outline-none data-[highlighted]:bg-[#F0F7EC]">
                            <Select.ItemText>Next {d}d</Select.ItemText>
                            <Select.ItemIndicator><Check size={11} className="text-[#1B6B2C]" /></Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
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
                    No tennis events in the next {dashboardDays} days
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {events.map((event, i) => (
                      <div key={i} className={`rounded-xl border-2 transition-all duration-150 ${selected === event ? "border-[#1B6B2C] bg-[#F0F7EC] shadow-md" : "border-[#E0EDD8] bg-white hover:border-[#A8C99A] hover:bg-[#F8FCF5]"}`}>
                        <div className="flex items-start gap-2 p-3">
                          {/* Checkbox */}
                          <Checkbox.Root
                            checked={checkedIndices.has(i)}
                            onCheckedChange={() => setCheckedIndices(prev => {
                              const next = new Set(prev);
                              next.has(i) ? next.delete(i) : next.add(i);
                              return next;
                            })}
                            className="w-4 h-4 rounded border-2 border-[#1B6B2C] bg-white flex-shrink-0 mt-0.5 flex items-center justify-center data-[state=checked]:bg-[#1B6B2C] focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox.Indicator><Check size={10} className="text-white" /></Checkbox.Indicator>
                          </Checkbox.Root>

                          {/* Event card (clickable → map) */}
                          <button className="flex-1 text-left min-w-0" onClick={() => setSelected(event)}>
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
                                <span className="flex items-center gap-0.5"><Play size={10} className="text-blue-400 rotate-90" />{event.weather.rain}%</span>
                                <span className="flex items-center gap-0.5"><Wind size={10} className="text-slate-400" />{event.weather.wind} km/h</span>
                              </div>
                            )}
                            {selected === event && <p className="text-[10px] text-[#1B6B2C] font-semibold mt-1.5 flex items-center gap-0.5"><ChevronRight size={10} />Showing on map</p>}
                          </button>
                        </div>
                      </div>
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

            {selected?.weather && <WeatherPanel w={selected.weather} label={selected.location.label} startTime={selected.startTime} />}

            {/* Tabs */}
            <div className="flex-shrink-0 border-t border-[#C5DDB8] bg-white" style={{ height: 270 }}>
              <Tabs.Root defaultValue="logs" className="h-full flex flex-col">
                <Tabs.List className="flex border-b border-[#E0EDD8] px-4 bg-[#F8FCF5] flex-shrink-0">
                  {[
                    { value: "logs", icon: <Zap size={13} />, label: "Message Log" },
                    { value: "template", icon: <FileText size={13} />, label: "Message Template" },
                    { value: "schedule", icon: <Settings size={13} />, label: "Schedule" },
                  ].map((tab) => (
                    <Tabs.Trigger key={tab.value} value={tab.value}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-[#5C7A5C] font-semibold border-b-2 border-transparent data-[state=active]:border-[#1B6B2C] data-[state=active]:text-[#1B6B2C] transition-colors"
                    >{tab.icon}{tab.label}</Tabs.Trigger>
                  ))}
                </Tabs.List>

                {/* Message Log */}
                <Tabs.Content value="logs" className="flex-1 overflow-hidden">
                  <ScrollArea.Root className="h-full">
                    <ScrollArea.Viewport className="h-full p-3">
                      {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-36 text-[#5C7A5C] text-xs gap-2">
                          <MessageSquare size={20} className="text-[#C5DDB8]" />
                          No messages logged yet. Hit &quot;Send&quot; to send your first one.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {logs.map((log) => (
                            <div key={log.id} className="border border-[#E0EDD8] rounded-xl overflow-hidden">
                              <button className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#F8FCF5] transition-colors"
                                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${log.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${log.manual ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                    {log.manual ? "Manual" : "Scheduled"}
                                  </span>
                                  <span className="text-xs font-semibold text-[#1A2B1A]">
                                    {log.selectedEvents ?? log.eventsCount} event{(log.selectedEvents ?? log.eventsCount) !== 1 ? "s" : ""} sent
                                  </span>
                                  {log.daysForward !== undefined && (
                                    <span className="text-[10px] text-[#5C7A5C]">· {log.daysForward}d lookhead</span>
                                  )}
                                  {log.status === "failure" && <span className="text-[10px] text-red-600 font-semibold">· Failed</span>}
                                </div>
                                <span className="text-[10px] text-[#5C7A5C] flex-shrink-0 ml-2">
                                  {new Date(log.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </button>
                              {expandedLog === log.id && (
                                <div className="border-t border-[#E0EDD8] bg-[#F8FCF5] px-3 py-2 space-y-1">
                                  <div className="flex gap-4 text-[10px] text-[#5C7A5C] mb-1">
                                    <span>Schedule: {pad(log.scheduleHour ?? 16)}:{pad(log.scheduleMinute ?? 0)} IL</span>
                                    <span>Lookhead: {log.daysForward ?? 1}d</span>
                                    <span>Total events: {log.eventsCount}</span>
                                  </div>
                                  {log.events?.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] text-[#1A2B1A]">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.weather?.isBad ? "bg-red-500" : "bg-emerald-500"}`} />
                                      <span className="font-semibold">{e.title}</span>
                                      <span className="text-[#5C7A5C]">· {fmtTime(e.startTime)} · {e.location}</span>
                                      {e.weather && <span className="text-[#5C7A5C]">· {e.weather.temp}°C, {e.weather.rain}% rain, {e.weather.wind} km/h</span>}
                                    </div>
                                  ))}
                                  {log.error && <p className="text-[10px] text-red-600 font-medium">Error: {log.error}</p>}
                                  {log.message && (
                                    <pre className="text-[10px] text-[#1A2B1A] whitespace-pre-wrap bg-white border border-[#E0EDD8] rounded-lg p-2 mt-1 max-h-20 overflow-y-auto">{log.message}</pre>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea.Viewport>
                  </ScrollArea.Root>
                </Tabs.Content>

                {/* Template */}
                <Tabs.Content value="template" className="flex-1 overflow-auto p-4">
                  <div className="flex gap-4 h-full min-h-0">
                    <div className="flex-1 space-y-2 overflow-auto">
                      {(["header", "eventBlock", "footerGood", "footerBad"] as const).map((field) => {
                        const labels: Record<string, string> = {
                          header: "Header (shown once — supports {date})",
                          eventBlock: "Per-event block (repeated for each event)",
                          footerGood: "Footer — good weather",
                          footerBad: "Footer — bad weather",
                        };
                        return (
                          <div key={field}>
                            <label className="block text-[10px] font-bold text-[#5C7A5C] uppercase tracking-wider mb-1">{labels[field]}</label>
                            <textarea rows={field === "eventBlock" ? 5 : 2}
                              value={config.template[field]}
                              onChange={(e) => saveConfig({ template: { ...config.template, [field]: e.target.value } })}
                              className="w-full rounded-lg border border-[#C5DDB8] p-2 text-xs font-mono text-[#1A2B1A] bg-[#F8FCF5] focus:outline-none focus:ring-2 focus:ring-[#1B6B2C] resize-none"
                            />
                          </div>
                        );
                      })}
                      <button onClick={() => saveConfig({ template: DEFAULT_TEMPLATE })}
                        className="text-[10px] text-[#5C7A5C] underline hover:text-[#1B6B2C]">Reset to default</button>
                    </div>
                    <div className="w-52 flex-shrink-0 bg-[#F0F7EC] rounded-xl border border-[#C5DDB8] p-3 self-start">
                      <p className="text-[10px] font-bold text-[#1B6B2C] uppercase tracking-wider mb-2">Available variables</p>
                      {TEMPLATE_VARS.map(({ key, desc }) => (
                        <div key={key} className="flex items-start gap-1.5 mb-1.5">
                          <code className="text-[10px] bg-white border border-[#C5DDB8] px-1.5 py-0.5 rounded font-mono text-[#1B6B2C] flex-shrink-0">{key}</code>
                          <span className="text-[10px] text-[#5C7A5C] leading-tight">{desc}</span>
                        </div>
                      ))}
                      <p className="text-[10px] text-[#5C7A5C] mt-2">Use <code className="bg-white border border-[#C5DDB8] px-1 rounded">&lt;b&gt;&lt;/b&gt;</code> for bold in Telegram.</p>
                    </div>
                  </div>
                </Tabs.Content>

                {/* Schedule */}
                <Tabs.Content value="schedule" className="flex-1 overflow-auto p-4">
                  <div className="flex gap-8 items-start">
                    <div>
                      <label className="block text-[10px] font-bold text-[#5C7A5C] uppercase tracking-wider mb-2">
                        Message lookhead — days included in Telegram
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={1} max={30}
                          value={config.messageDaysForward}
                          onChange={(e) => saveConfig({ messageDaysForward: Math.max(1, Math.min(30, Number(e.target.value))) })}
                          className="w-20 rounded-lg border-2 border-[#C5DDB8] px-3 py-2 text-lg font-bold text-[#1B6B2C] text-center bg-[#F8FCF5] focus:outline-none focus:border-[#1B6B2C]"
                        />
                        <span className="text-sm text-[#5C7A5C]">days</span>
                      </div>
                      <p className="text-[10px] text-[#5C7A5C] mt-2 max-w-[180px]">
                        Default 1 = tomorrow only. Increase to include more days in each notification.
                      </p>
                    </div>

                    <div className="w-px bg-[#C5DDB8] self-stretch" />

                    <div>
                      <label className="block text-[10px] font-bold text-[#5C7A5C] uppercase tracking-wider mb-2">
                        Daily send time (Israel time)
                        {savingSchedule && <span className="ml-2 text-amber-600 normal-case">saving...</span>}
                      </label>
                      <DigitalClockInput
                        hour={config.scheduleHour}
                        minute={config.scheduleMinute}
                        onChange={(h, m) => saveSchedule({ scheduleHour: h, scheduleMinute: m })}
                      />
                      <p className="text-[10px] text-[#5C7A5C] mt-2 max-w-[200px]">
                        Changing the time auto-commits a new schedule to GitHub. Vercel redeploys in ~1 min.
                      </p>
                    </div>
                  </div>
                </Tabs.Content>
              </Tabs.Root>
            </div>
          </div>
        </div>
      </div>

      <Toast.Root open={toast.open} onOpenChange={(open) => setToast(t => ({ ...t, open }))} duration={4000}
        className={`fixed bottom-5 right-5 z-50 rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold border ${toast.ok ? "bg-white border-[#C5DDB8] text-[#1B6B2C]" : "bg-white border-red-200 text-red-700"}`}>
        {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <Toast.Description>{toast.message}</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-0 right-0 p-5 z-50" />
    </Toast.Provider>
  );
}
