"use client";

import { useEffect, useRef, useMemo } from "react";
import { GoogleMap, useLoadScript, MarkerF, Circle } from "@react-google-maps/api";
import { RefreshCw } from "lucide-react";

interface Props {
  lat: number;
  lng: number;
  label: string;
  userLat?: number;
  userLng?: number;
  defaultView?: boolean; // true = showing user location (no event selected)
}

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
};

const TENNIS_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52">
  <circle cx="21" cy="21" r="19" fill="#1B6B2C" stroke="white" stroke-width="2.5"/>
  <text x="21" y="28" text-anchor="middle" font-size="19">🎾</text>
  <polygon points="21,48 13,36 29,36" fill="#1B6B2C"/>
</svg>`;

const TENNIS_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(TENNIS_MARKER_SVG)}`;

export default function TennisMap({ lat, lng, label, userLat, userLng, defaultView }: Props) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "",
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);

  // Fly to new center when lat/lng changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
    }
  }, [lat, lng]);

  if (loadError) return (
    <div className="w-full h-full flex items-center justify-center bg-[#F0F7EC] text-[#5C7A5C] text-sm flex-col gap-2">
      <span>Map failed to load</span>
      <span className="text-xs">Enable Maps JavaScript API in Google Cloud Console</span>
    </div>
  );

  if (!isLoaded) return (
    <div className="w-full h-full flex items-center justify-center bg-[#F0F7EC]">
      <RefreshCw size={24} className="animate-spin text-[#1B6B2C]" />
    </div>
  );

  return (
    <GoogleMap
      zoom={defaultView ? 14 : 15}
      center={center}
      mapContainerStyle={{ width: "100%", height: "100%" }}
      options={MAP_OPTIONS}
      onLoad={(map) => { mapRef.current = map; }}
    >
      {/* Event location pin — only when event is selected */}
      {!defaultView && (
        <MarkerF
          position={{ lat, lng }}
          title={label}
          icon={{
            url: TENNIS_ICON_URL,
            scaledSize: new window.google.maps.Size(42, 52),
            anchor: new window.google.maps.Point(21, 52),
          }}
        />
      )}

      {/* User location dot */}
      {userLat !== undefined && userLng !== undefined && (
        <>
          <Circle
            center={{ lat: userLat, lng: userLng }}
            radius={40}
            options={{ fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, zIndex: 10 }}
          />
          <Circle
            center={{ lat: userLat, lng: userLng }}
            radius={200}
            options={{ fillColor: "#4285F4", fillOpacity: 0.15, strokeColor: "#4285F4", strokeWeight: 0 }}
          />
        </>
      )}
    </GoogleMap>
  );
}
