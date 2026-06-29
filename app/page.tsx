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
  MapPin, Wind, Thermometer, Droplets,
  Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Calendar, FileText, Settings, ChevronRight, MessageSquare,
  Check, ChevronDown, ChevronUp, Send, Zap, CheckSquare, Square,
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
interface AppConfig { messageDaysForward: number; scheduleHour: number; scheduleMinute: number; template: MessageTemplate; windThreshold: number; rainThreshold: number }

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
    <div className="border-t border-[#C2D9C2] bg-white px-6 py-4 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] text-[#4D7257] font-semibold uppercase tracking-widest">Weather at event time</p>
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
  const spinCls = "text-[#1A8C40] hover:text-[#157835] hover:bg-[#DDE8DD] rounded p-0.5 transition-colors";
  return (
    <div className="inline-flex items-center gap-1 bg-[#F4F9F4] border-2 border-[#C2D9C2] rounded-xl px-4 py-2 select-none">
      <div className="flex flex-col items-center gap-0.5">
        <button onClick={() => onChange((hour + 1) % 24, minute)} className={spinCls}><ChevronUp size={13} /></button>
        <span className="text-2xl font-bold font-mono text-[#1A8C40] w-9 text-center leading-none">{pad(hour)}</span>
        <button onClick={() => onChange((hour - 1 + 24) % 24, minute)} className={spinCls}><ChevronDown size={13} /></button>
      </div>
      <span className="text-2xl font-bold text-[#1A8C40] pb-0.5">:</span>
      <div className="flex flex-col items-center gap-0.5">
        <button onClick={() => onChange(hour, (minute + 5) % 60)} className={spinCls}><ChevronUp size={13} /></button>
        <span className="text-2xl font-bold font-mono text-[#1A8C40] w-9 text-center leading-none">{pad(minute)}</span>
        <button onClick={() => onChange(hour, (minute - 5 + 60) % 60)} className={spinCls}><ChevronDown size={13} /></button>
      </div>
      <span className="text-[10px] text-[#4D7257] ml-1.5 self-center font-semibold">IL</span>
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
  const [config, setConfig] = useState<AppConfig>({ messageDaysForward: 1, scheduleHour: 16, scheduleMinute: 0, template: DEFAULT_TEMPLATE, windThreshold: 20, rainThreshold: 30 });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [toast, setToast] = useState({ open: false, message: "", ok: true });
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentWeather, setCurrentWeather] = useState<EventWeather | null>(null);
  const [loadingCurrentWeather, setLoadingCurrentWeather] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(true);
  const scheduleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref holds latest thresholds so loadEvents never has a stale closure over config
  const thresholdsRef = useRef({ wind: 20, rain: 30 });
  const dashboardDaysRef = useRef(dashboardDays);

  const showToast = (message: string, ok = true) => setToast({ open: true, message, ok });

  const loadEvents = useCallback(async (days?: number, wind?: number, rain?: number) => {
    const d = days ?? dashboardDaysRef.current;
    const w = wind ?? thresholdsRef.current.wind;
    const r = rain ?? thresholdsRef.current.rain;
    setLoading(true);
    try {
      const res = await fetch(`/api/events?days=${d}&windThreshold=${w}&rainThreshold=${r}`);
      if (!res.ok) throw new Error("Failed");
      const data: TennisEvent[] = await res.json();
      setEvents(data);
      setCheckedIndices(prev => {
        if (prev.size === 0 && data.length > 0) return new Set([0]);
        const next = new Set<number>();
        prev.forEach(i => { if (i < data.length) next.add(i); });
        if (next.size === 0 && data.length > 0) next.add(0);
        return next;
      });
      setSelected(prev => {
        if (!prev) return null;
        return data.some(e => e.title === prev.title && e.startTime === prev.startTime) ? prev : null;
      });
      setLastRefresh(new Date());
    } catch { showToast("Failed to refresh calendar", false); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLogs = useCallback(async () => {
    try { const r = await fetch("/api/logs"); const d = await r.json(); setLogs(Array.isArray(d) ? d : []); } catch {}
  }, []);

  // Load config first, then events with correct thresholds
  useEffect(() => {
    const init = async () => {
      try {
        const r = await fetch("/api/config");
        const cfg: AppConfig = await r.json();
        setConfig(cfg);
        thresholdsRef.current = { wind: cfg.windThreshold ?? 20, rain: cfg.rainThreshold ?? 30 };
        dashboardDaysRef.current = dashboardDays;
        await loadEvents(dashboardDays, cfg.windThreshold, cfg.rainThreshold);
      } catch {
        await loadEvents();
      }
      loadLogs();
    };
    init();
    const t = setInterval(() => loadEvents(), 60000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dashboardDaysRef.current = dashboardDays;
    loadEvents(dashboardDays);
  }, [dashboardDays, loadEvents]);

  // Get user's current location once
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {} // silently ignore if denied
    );
  }, []);

  // Fetch current weather for user location when no event is selected
  useEffect(() => {
    if (selected || !userLocation) { if (!selected) setCurrentWeather(null); return; }
    setLoadingCurrentWeather(true);
    const now = new Date().toISOString();
    fetch(`/api/weather?lat=${userLocation.lat}&lng=${userLocation.lng}&date=${encodeURIComponent(now)}`)
      .then(r => r.json())
      .then(w => setCurrentWeather({
        temp: Math.round(w.temperature),
        rain: w.rainProbability,
        wind: Math.round(w.windSpeed),
        isBad: w.windSpeed >= config.windThreshold || w.rainProbability >= config.rainThreshold,
      }))
      .catch(() => {})
      .finally(() => setLoadingCurrentWeather(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, userLocation]);

  const saveConfig = async (updates: Partial<AppConfig>) => {
    const next = { ...config, ...updates, template: { ...config.template, ...(updates.template ?? {}) } };
    setConfig(next);
    try {
      await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    } catch { showToast("Failed to save settings", false); }
  };

  const updateTemplate = (field: keyof MessageTemplate, value: string) => {
    const updated = { ...config.template, [field]: value };
    setConfig(c => ({ ...c, template: updated }));
    setTemplateSaved(false);
    if (templateDebounce.current) clearTimeout(templateDebounce.current);
    templateDebounce.current = setTimeout(async () => {
      try {
        await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, template: updated }) });
        setTemplateSaved(true);
      } catch { showToast("Failed to save template", false); }
    }, 800);
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

  // Checked events that have weather loaded
  const checkedWithWeather = Array.from(checkedIndices).filter(i => events[i]?.weather !== null);
  const weatherPending = loading || (checkedIndices.size > 0 && checkedWithWeather.length < checkedIndices.size);

  const doRun = async () => {
    if (checkedIndices.size === 0) { showToast("No events selected", false); return; }
    if (weatherPending) { showToast("Weather is still loading, please wait", false); return; }
    setRunning(true);
    try {
      const selectedStartTimes = Array.from(checkedIndices).map(i => events[i].startTime);
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedStartTimes,
          daysToFetch: dashboardDays,
          template: config.template,
          windThreshold: config.windThreshold,
          rainThreshold: config.rainThreshold,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      showToast(data.message === "No tennis events found" ? "No upcoming tennis events" : `✓ Sent ${data.events} event(s)`);
      await loadLogs();
    } catch (err) { showToast(String(err), false); }
    finally { setRunning(false); }
  };

  const allChecked = events.length > 0 && checkedIndices.size === events.length;
  const toggleAll = () => setCheckedIndices(allChecked ? new Set() : new Set(events.map((_, i) => i)));

  return (
    <Toast.Provider swipeDirection="right">
      <div className="h-screen flex flex-col bg-[#F4F9F4] font-sans overflow-hidden">

        {/* Header */}
        <header className="bg-white px-6 py-3.5 flex items-center justify-between border-b border-[#DDE8DD] shadow-[0_1px_4px_rgba(0,0,0,0.06)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎾</span>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-tight text-[#0D1F12]">Tennis Weather Agent</h1>
              <p className="text-[#5A7B62] text-[11px]">Dashboard & Control Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-[#5A7B62] text-xs flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[#1A8C40] rounded-full animate-pulse" />
                {lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => loadEvents(dashboardDays)}
              className="p-2 rounded-lg bg-[#EEF5EE] hover:bg-[#DDE8DD] text-[#1A8C40] transition-colors"
              title="Refresh calendar"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <span title={
              checkedIndices.size === 0 ? "Check at least one event to send"
              : weatherPending ? "Waiting for weather data…"
              : `Send message for ${checkedIndices.size} event(s)`
            }>
              <button
                onClick={doRun}
                disabled={running || checkedIndices.size === 0 || weatherPending}
                className="flex items-center gap-2 bg-[#1A8C40] text-white font-bold px-4 py-2 rounded-lg hover:bg-[#157835] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
              >
                {running ? <RefreshCw size={13} className="animate-spin" />
                  : weatherPending ? <RefreshCw size={13} className="animate-spin" />
                  : <Send size={13} />}
                {weatherPending ? "Loading…"
                  : checkedIndices.size > 0 ? `Send (${checkedIndices.size})`
                  : "Send"}
              </button>
            </span>
          </div>
        </header>

        {/* Main */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: events */}
          <div className="w-80 flex-shrink-0 border-r border-[#C2D9C2] bg-white flex flex-col">
            {/* Panel header */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-[#1A8C40]" />
                <span className="font-semibold text-[#1A2B1A] text-sm">Upcoming Practices</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Select all toggle */}
                {events.length > 0 && (
                  <button onClick={toggleAll} title={allChecked ? "Deselect all" : "Select all"}
                    className="flex items-center gap-1 text-[#1A8C40] hover:text-[#157835] transition-colors p-1 rounded hover:bg-[#F4F9F4]">
                    {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                )}
                {/* Days filter */}
                <Select.Root value={String(dashboardDays)} onValueChange={(v) => setDashboardDays(Number(v))}>
                  <Select.Trigger className="flex items-center gap-1 text-[11px] text-[#1A8C40] bg-[#F4F9F4] border border-[#C2D9C2] px-2 py-1 rounded-full font-semibold hover:bg-[#DDE8DD] transition-colors focus:outline-none">
                    <Select.Value />
                    <Select.Icon><ChevronDown size={10} /></Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="bg-white border border-[#C2D9C2] rounded-xl shadow-xl z-50 overflow-hidden">
                      <Select.Viewport className="p-1">
                        {DASHBOARD_DAY_OPTIONS.map(d => (
                          <Select.Item key={d} value={String(d)} className="flex items-center gap-2 px-3 py-2 text-xs text-[#1A2B1A] rounded-lg cursor-pointer hover:bg-[#F4F9F4] focus:outline-none data-[highlighted]:bg-[#F4F9F4]">
                            <Select.ItemText>Next {d}d</Select.ItemText>
                            <Select.ItemIndicator><Check size={11} className="text-[#1A8C40]" /></Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
            </div>
            <Separator.Root className="bg-[#DDE8DD] h-px flex-shrink-0" />

            <ScrollArea.Root className="flex-1 overflow-hidden">
              <ScrollArea.Viewport className="h-full w-full">
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-[#4D7257] text-sm">
                    <RefreshCw size={15} className="animate-spin mr-2" />Loading...
                  </div>
                ) : events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-[#4D7257] text-sm gap-2 p-4 text-center">
                    <Calendar size={28} className="text-[#C2D9C2]" />
                    No tennis events in the next {dashboardDays} days
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {events.map((event, i) => (
                      <div key={i} className={`rounded-xl border-2 transition-all duration-150 ${selected === event ? "border-[#1A8C40] bg-[#F0FAF2] shadow-md" : "border-[#DDE8DD] bg-white hover:border-[#8DC48D] hover:bg-[#F6FAF6]"}`}>
                        <div className="flex items-start gap-2 p-3">
                          {/* Checkbox */}
                          <Checkbox.Root
                            checked={checkedIndices.has(i)}
                            onCheckedChange={() => setCheckedIndices(prev => {
                              const next = new Set(prev);
                              next.has(i) ? next.delete(i) : next.add(i);
                              return next;
                            })}
                            className="w-4 h-4 rounded border-2 border-[#1A8C40] bg-white flex-shrink-0 mt-0.5 flex items-center justify-center data-[state=checked]:bg-[#1A8C40] focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox.Indicator><Check size={10} className="text-white" /></Checkbox.Indicator>
                          </Checkbox.Root>

                          {/* Event card (clickable → map) */}
                          <button className="flex-1 text-left min-w-0" onClick={() => setSelected(s => s === event ? null : event)}>
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <span className="text-[#1A8C40] font-bold text-sm">{fmtDate(event.startTime)}</span>
                              {event.weather
                                ? <WeatherBadge w={event.weather} />
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500"><RefreshCw size={9} className="animate-spin" />Weather…</span>}
                            </div>
                            <p className="text-[#1A2B1A] font-semibold text-xs leading-tight line-clamp-2 mb-2">{event.title}</p>
                            <div className="flex items-center gap-1 text-xs text-[#4D7257] mb-1">
                              <Clock size={10} />{fmtTime(event.startTime)}–{fmtTime(event.endTime)}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-[#4D7257]">
                              <MapPin size={10} /><span className="truncate">{event.location.label}</span>
                            </div>
                            {event.weather && (
                              <div className="flex items-center gap-3 mt-2 text-xs text-[#4D7257]">
                                <span className="flex items-center gap-0.5"><Thermometer size={10} className="text-orange-400" />{event.weather.temp}°C</span>
                                <span className="flex items-center gap-0.5"><Droplets size={10} className="text-blue-400" />{event.weather.rain}%</span>
                                <span className="flex items-center gap-0.5"><Wind size={10} className="text-slate-400" />{event.weather.wind} km/h</span>
                              </div>
                            )}
                            {selected === event && <p className="text-[10px] text-[#1A8C40] font-semibold mt-1.5 flex items-center gap-0.5"><ChevronRight size={10} />Showing on map</p>}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar orientation="vertical" className="w-1.5 bg-transparent p-px">
                <ScrollArea.Thumb className="bg-[#C2D9C2] rounded-full" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </div>

          {/* Right: map + weather strip + tabs */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Map */}
            <div className="flex-1 relative min-h-0">
              {selected || userLocation ? (
                <TennisMap
                  lat={selected ? selected.location.lat : userLocation!.lat}
                  lng={selected ? selected.location.lng : userLocation!.lng}
                  label={selected ? selected.location.label : "Your location"}
                  userLat={userLocation?.lat}
                  userLng={userLocation?.lng}
                  defaultView={!selected}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#F4F9F4] text-[#4D7257]">
                  <MapPin size={44} className="text-[#C2D9C2] mb-3" />
                  <p className="font-semibold text-sm">Waiting for location…</p>
                  <p className="text-xs mt-1 text-[#8DC48D]">Allow location access to see the map</p>
                </div>
              )}
            </div>

            {/* Weather strip */}
            {(() => {
              const w = selected?.weather ?? currentWeather;
              const isLoading = !selected && loadingCurrentWeather;
              const label = selected ? selected.location.label : "Current location";
              const timeLabel = selected ? `${fmtDate(selected.startTime)} · ${fmtTime(selected.startTime)}` : "Now";
              const rainCls = (v: number) => v >= config.rainThreshold ? "text-red-500" : v >= config.rainThreshold * 0.6 ? "text-amber-500" : "text-emerald-600";
              const windCls = (v: number) => v >= config.windThreshold ? "text-red-500" : v >= config.windThreshold * 0.6 ? "text-amber-500" : "text-emerald-600";

              return (
                <div className="flex-shrink-0 border-t border-[#DDE8DD] bg-[#F6FAF6] px-4 py-2 flex items-center gap-4 text-xs">
                  <span className="text-[10px] font-bold text-[#4D7257] uppercase tracking-wider whitespace-nowrap">
                    {selected ? "Event" : "Now"}
                  </span>

                  {isLoading ? (
                    <RefreshCw size={12} className="animate-spin text-[#4D7257]" />
                  ) : w ? (
                    <>
                      <span className={`flex items-center gap-1 font-semibold ${w.isBad ? "text-red-600" : "text-emerald-600"}`}>
                        {w.isBad ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                        {w.isBad ? "Poor" : "Good"}
                      </span>
                      <span className="flex items-center gap-1 text-orange-600 font-semibold">
                        <Thermometer size={12} /> {w.temp}°C
                      </span>
                      <span className={`flex items-center gap-1 font-semibold ${rainCls(w.rain)}`}>
                        <Droplets size={12} /> {w.rain}%
                      </span>
                      <span className={`flex items-center gap-1 font-semibold ${windCls(w.wind)}`}>
                        <Wind size={12} /> {w.wind} km/h
                      </span>
                    </>
                  ) : (
                    <span className="text-[#8DC48D]">{selected ? "Loading…" : "Allow location access"}</span>
                  )}

                  <span className="ml-auto flex items-center gap-2">
                    {selected && (
                      <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-[10px] font-semibold text-[#4D7257] hover:text-[#1A8C40] border border-[#C2D9C2] rounded-full px-2 py-0.5 hover:border-[#1A8C40] transition-colors">
                        <MapPin size={9} /> My location
                      </button>
                    )}
                    <span className="text-[#4D7257] truncate max-w-[180px]">{label} · {timeLabel}</span>
                  </span>
                </div>
              );
            })()}

            {/* Tabs */}
            <div className="flex-shrink-0 border-t border-[#C2D9C2] bg-white" style={{ height: 320 }}>
              <Tabs.Root defaultValue="logs" className="h-full flex flex-col">
                <Tabs.List className="flex border-b border-[#DDE8DD] px-4 bg-[#F6FAF6] flex-shrink-0">
                  {[
                    { value: "logs", icon: <Zap size={13} />, label: "Message Log" },
                    { value: "template", icon: <FileText size={13} />, label: "Message Template" },
                    { value: "settings", icon: <Settings size={13} />, label: "Settings" },
                  ].map((tab) => (
                    <Tabs.Trigger key={tab.value} value={tab.value}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-[#4D7257] font-semibold border-b-2 border-transparent data-[state=active]:border-[#1A8C40] data-[state=active]:text-[#1A8C40] transition-colors"
                    >{tab.icon}{tab.label}</Tabs.Trigger>
                  ))}
                </Tabs.List>

                {/* Message Log */}
                <Tabs.Content value="logs" className="flex-1 overflow-hidden">
                  <ScrollArea.Root className="h-full">
                    <ScrollArea.Viewport className="h-full p-3">
                      {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-36 text-[#4D7257] text-xs gap-2">
                          <MessageSquare size={20} className="text-[#C2D9C2]" />
                          No messages logged yet. Hit &quot;Send&quot; to send your first one.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {logs.map((log) => (
                            <div key={log.id} className="border border-[#DDE8DD] rounded-xl overflow-hidden">
                              <button className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#F6FAF6] transition-colors"
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
                                    <span className="text-[10px] text-[#4D7257]">· {log.daysForward}d lookhead</span>
                                  )}
                                  {log.status === "failure" && <span className="text-[10px] text-red-600 font-semibold">· Failed</span>}
                                </div>
                                <span className="text-[10px] text-[#4D7257] flex-shrink-0 ml-2">
                                  {new Date(log.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </button>
                              {expandedLog === log.id && (
                                <div className="border-t border-[#DDE8DD] bg-[#F6FAF6] px-3 py-2 space-y-1">
                                  <div className="flex gap-4 text-[10px] text-[#4D7257] mb-1">
                                    <span>Schedule: {pad(log.scheduleHour ?? 16)}:{pad(log.scheduleMinute ?? 0)} IL</span>
                                    <span>Lookhead: {log.daysForward ?? 1}d</span>
                                    <span>Total events: {log.eventsCount}</span>
                                  </div>
                                  {log.events?.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] text-[#1A2B1A]">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.weather?.isBad ? "bg-red-500" : "bg-emerald-500"}`} />
                                      <span className="font-semibold">{e.title}</span>
                                      <span className="text-[#4D7257]">· {fmtTime(e.startTime)} · {e.location}</span>
                                      {e.weather && <span className="text-[#4D7257]">· {e.weather.temp}°C, {e.weather.rain}% rain, {e.weather.wind} km/h</span>}
                                    </div>
                                  ))}
                                  {log.error && <p className="text-[10px] text-red-600 font-medium">Error: {log.error}</p>}
                                  {log.message && (
                                    <pre className="text-[10px] text-[#1A2B1A] whitespace-pre-wrap bg-white border border-[#DDE8DD] rounded-lg p-2 mt-1 max-h-20 overflow-y-auto">{log.message}</pre>
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
                <Tabs.Content value="template" className="flex-1 overflow-hidden">
                  <div className="flex h-full">
                    {/* Editors */}
                    <div className="flex-1 overflow-y-auto border-r border-[#DDE8DD] p-3 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-[#4D7257]">Edit fields below — changes auto-save</span>
                          {templateSaved
                            ? <span className="text-[10px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={10} />Saved</span>
                            : <span className="text-[10px] text-amber-600">Saving…</span>}
                        </div>
                        {(["header", "eventBlock", "footerGood", "footerBad"] as const).map((field) => {
                          const labels: Record<string, string> = {
                            header: "Header — {date} available",
                            eventBlock: "Per-event block — all variables available",
                            footerGood: "Footer — good weather",
                            footerBad: "Footer — bad weather",
                          };
                          return (
                            <div key={field}>
                              <label className="block text-[10px] font-bold text-[#4D7257] uppercase tracking-wider mb-1">{labels[field]}</label>
                              <textarea rows={field === "eventBlock" ? 4 : 2}
                                value={config.template[field]}
                                onChange={(e) => updateTemplate(field, e.target.value)}
                                className="w-full rounded-lg border border-[#C2D9C2] p-2 text-xs font-mono text-[#1A2B1A] bg-[#F6FAF6] focus:outline-none focus:ring-2 focus:ring-[#1A8C40] resize-none"
                              />
                            </div>
                          );
                        })}
                        <button onClick={() => { saveConfig({ template: DEFAULT_TEMPLATE }); setTemplateSaved(true); }}
                          className="text-[10px] text-[#4D7257] underline hover:text-[#1A8C40]">Reset to default</button>
                    </div>

                    {/* Variables */}
                    <div className="w-36 flex-shrink-0 border-r border-[#DDE8DD] p-2 overflow-auto bg-[#F6FAF6]">
                      <p className="text-[9px] font-bold text-[#1A8C40] uppercase tracking-wider mb-1.5">Variables</p>
                      {TEMPLATE_VARS.map(({ key, desc }) => (
                        <div key={key} className="mb-1.5">
                          <code className="text-[9px] bg-white border border-[#C2D9C2] px-1 py-0.5 rounded font-mono text-[#1A8C40] block">{key}</code>
                          <span className="text-[9px] text-[#4D7257] leading-tight">{desc}</span>
                        </div>
                      ))}
                      <p className="text-[9px] text-[#4D7257] mt-2 border-t border-[#DDE8DD] pt-2">Use <code className="bg-white border border-[#C2D9C2] px-0.5 rounded">&lt;b&gt;</code> for bold</p>
                    </div>

                    {/* Live preview */}
                    <div className="w-56 flex-shrink-0 p-2 overflow-auto bg-white">
                      <p className="text-[9px] font-bold text-[#1A8C40] uppercase tracking-wider mb-1.5">Preview {events.length === 0 && "(no events)"}</p>
                      <pre className="text-[10px] text-[#1A2B1A] whitespace-pre-wrap font-mono leading-relaxed bg-[#F6FAF6] rounded-lg border border-[#DDE8DD] p-2">
                        {(() => {
                          const ev = events[0];
                          if (!ev) return "Load calendar events to see a preview here.";
                          const w = ev.weather;
                          const d = new Date(ev.startTime).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
                          const t = `${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)}`;
                          const fill = (tpl: string) => tpl
                            .replace(/{date}/g, d)
                            .replace(/{title}/g, ev.title)
                            .replace(/{time}/g, t)
                            .replace(/{venue}/g, ev.location.label)
                            .replace(/{temp}/g, w ? String(w.temp) : "–")
                            .replace(/{rain}/g, w ? String(w.rain) : "–")
                            .replace(/{wind}/g, w ? String(w.wind) : "–")
                            .replace(/{condition}/g, w?.isBad ? "⚠️ Bad conditions" : "✅ Good conditions")
                            .replace(/<b>/g, "").replace(/<\/b>/g, "");
                          const anyBad = w?.isBad ?? false;
                          return [
                            fill(config.template.header),
                            "",
                            fill(config.template.eventBlock),
                            "",
                            fill(anyBad ? config.template.footerBad : config.template.footerGood),
                          ].join("\n");
                        })()}
                      </pre>
                    </div>
                  </div>
                </Tabs.Content>

                {/* Settings */}
                <Tabs.Content value="settings" className="flex-1 overflow-auto">
                  <div className="flex h-full divide-x divide-[#DDE8DD]">

                    {/* Bad weather thresholds */}
                    <div className="flex-1 p-4 space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-[#4D7257] uppercase tracking-wider mb-3">Bad weather thresholds</p>
                        <p className="text-[10px] text-[#4D7257] mb-3">Weather is flagged as bad if wind OR rain exceeds these values.</p>
                      </div>

                      {/* Wind */}
                      <div>
                        <label className="block text-xs font-semibold text-[#1A2B1A] mb-1.5 flex items-center gap-1.5">
                          <Wind size={13} className="text-[#1A8C40]" /> Wind speed threshold
                        </label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} max={100}
                            value={config.windThreshold}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(100, Number(e.target.value)));
                              setConfig(c => ({ ...c, windThreshold: v }));
                              thresholdsRef.current = { wind: v, rain: config.rainThreshold };
                              loadEvents(dashboardDays, v, config.rainThreshold);
                            }}
                            onBlur={(e) => {
                              const v = Math.max(1, Math.min(100, Number(e.target.value)));
                              const next = { ...config, windThreshold: v };
                              saveConfig(next);
                            }}
                            className="w-20 rounded-lg border-2 border-[#C2D9C2] px-3 py-2 text-base font-bold text-[#1A8C40] text-center bg-[#F4F9F4] focus:outline-none focus:border-[#1A8C40]"
                          />
                          <span className="text-sm text-[#4D7257]">km/h</span>
                          <span className="text-[10px] text-[#4D7257] ml-1">Current: {config.windThreshold} km/h</span>
                        </div>
                      </div>

                      {/* Rain */}
                      <div>
                        <label className="block text-xs font-semibold text-[#1A2B1A] mb-1.5 flex items-center gap-1.5">
                          <Droplets size={13} className="text-[#1A8C40]" /> Rain probability threshold
                        </label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} max={100}
                            value={config.rainThreshold}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(100, Number(e.target.value)));
                              setConfig(c => ({ ...c, rainThreshold: v }));
                              thresholdsRef.current = { wind: config.windThreshold, rain: v };
                              loadEvents(dashboardDays, config.windThreshold, v);
                            }}
                            onBlur={(e) => {
                              const v = Math.max(1, Math.min(100, Number(e.target.value)));
                              const next = { ...config, rainThreshold: v };
                              saveConfig(next);
                            }}
                            className="w-20 rounded-lg border-2 border-[#C2D9C2] px-3 py-2 text-base font-bold text-[#1A8C40] text-center bg-[#F4F9F4] focus:outline-none focus:border-[#1A8C40]"
                          />
                          <span className="text-sm text-[#4D7257]">%</span>
                          <span className="text-[10px] text-[#4D7257] ml-1">Current: {config.rainThreshold}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-px bg-[#DDE8DD]" />

                    {/* Schedule */}
                    <div className="flex-1 p-4 space-y-4">
                      <p className="text-[10px] font-bold text-[#4D7257] uppercase tracking-wider">Schedule</p>

                      <div>
                        <label className="block text-xs font-semibold text-[#1A2B1A] mb-1.5 flex items-center gap-1.5">
                          <Calendar size={13} className="text-[#1A8C40]" /> Message lookhead
                        </label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} max={30}
                            value={config.messageDaysForward}
                            onChange={(e) => saveConfig({ messageDaysForward: Math.max(1, Math.min(30, Number(e.target.value))) })}
                            className="w-20 rounded-lg border-2 border-[#C2D9C2] px-3 py-2 text-base font-bold text-[#1A8C40] text-center bg-[#F4F9F4] focus:outline-none focus:border-[#1A8C40]"
                          />
                          <span className="text-sm text-[#4D7257]">days ahead</span>
                        </div>
                        <p className="text-[10px] text-[#4D7257] mt-1">1 = tomorrow only</p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#1A2B1A] mb-1.5 flex items-center gap-1.5">
                          <Clock size={13} className="text-[#1A8C40]" /> Daily send time
                          {savingSchedule && <span className="text-amber-600 text-[10px] font-normal">saving…</span>}
                        </label>
                        <DigitalClockInput
                          hour={config.scheduleHour}
                          minute={config.scheduleMinute}
                          onChange={(h, m) => saveSchedule({ scheduleHour: h, scheduleMinute: m })}
                        />
                        <p className="text-[10px] text-[#4D7257] mt-1">Israel time · triggers GitHub redeploy</p>
                      </div>
                    </div>
                  </div>
                </Tabs.Content>
              </Tabs.Root>
            </div>
          </div>
        </div>
      </div>

      <Toast.Root open={toast.open} onOpenChange={(open) => setToast(t => ({ ...t, open }))} duration={4000}
        className={`fixed bottom-5 right-5 z-50 rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 text-sm font-semibold border ${toast.ok ? "bg-white border-[#C2D9C2] text-[#1A8C40]" : "bg-white border-red-200 text-red-700"}`}>
        {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <Toast.Description>{toast.message}</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-0 right-0 p-5 z-50" />
    </Toast.Provider>
  );
}
