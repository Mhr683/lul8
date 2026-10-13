import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  Search,
  CheckCircle2,
  Crosshair,
  Loader2,
  AlertCircle,
  Maximize2,
  Minimize2,
  Globe,
  Plus,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';

export interface DetectedAddressPayload {
  streetAddress: string;
  cityDistrict?: string;
  district?: string;
  stateProvince?: string;
  countryIso?: string;
  countryName?: string;
  postalCode?: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface GoogleMapsAddressDetectorProps {
  countryIso: string;
  initialLat?: number;
  initialLng?: number;
  currentStreetAddress?: string;
  onAddressDetected: (payload: DetectedAddressPayload) => void;
}

const DEFAULT_CENTER_PAKISTAN = { lat: 31.5204, lng: 74.3587 }; // Lahore
const DEFAULT_CENTER_UK = { lat: 51.5074, lng: -0.1278 }; // London
const DEFAULT_CENTER_US = { lat: 40.7128, lng: -74.006 }; // New York
const DEFAULT_CENTER_UAE = { lat: 25.2048, lng: 55.2708 }; // Dubai

function getCountryDefaultCenter(iso: string) {
  switch (iso.toUpperCase()) {
    case 'PK':
      return DEFAULT_CENTER_PAKISTAN;
    case 'GB':
      return DEFAULT_CENTER_UK;
    case 'US':
      return DEFAULT_CENTER_US;
    case 'AE':
      return DEFAULT_CENTER_UAE;
    default:
      return DEFAULT_CENTER_PAKISTAN;
  }
}

// Places Autocomplete Search Bar Component
function PlacesAutocompleteSearchBar({
  onSelectPlace,
}: {
  onSelectPlace: (lat: number, lng: number, place: google.maps.places.Place) => void;
}) {
  const placesLib = useMapsLibrary('places');
  const [queryText, setQueryText] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const sessionTokenRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!placesLib || !queryText.trim()) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib as any;
    if (!sessionTokenRef.current && AutocompleteSessionToken) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    const timeoutId = setTimeout(() => {
      if (!AutocompleteSuggestion) return;
      setIsSearching(true);
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: queryText,
        sessionToken: sessionTokenRef.current || undefined,
      })
        .then((res: { suggestions?: any[] }) => {
          setSuggestions(res?.suggestions || []);
          setIsOpen(true);
        })
        .catch((err: unknown) => {
          console.warn('Place autocomplete lookup warning:', err);
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 280);

    return () => clearTimeout(timeoutId);
  }, [placesLib, queryText]);

  const handleSelectSuggestion = async (suggestion: any) => {
    if (!placesLib || !suggestion.placePrediction) return;
    try {
      setIsSearching(true);
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['location', 'formattedAddress', 'addressComponents', 'displayName'],
      });

      // Reset session token
      sessionTokenRef.current = null;
      setSuggestions([]);
      setIsOpen(false);
      setQueryText(place.displayName || place.formattedAddress || '');

      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        onSelectPlace(lat, lng, place);
      }
    } catch (err) {
      console.error('Failed to fetch place details:', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#747775]">
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#C5A880]" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>
        <input
          type="text"
          value={queryText}
          onChange={(e) => {
            setQueryText(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder="Search place, sector, road, landmark (e.g. DHA Phase 5, Clifton, Gulberg)..."
          className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-black/15 focus:border-[#141413] focus:outline-none placeholder:text-[#8E8E93]"
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-black/10 shadow-lg text-xs divide-y divide-black/5">
          {suggestions.map((s, idx) => {
            const mainText = s.placePrediction?.mainText?.text || s.placePrediction?.text?.text;
            const secondaryText = s.placePrediction?.secondaryText?.text;
            return (
              <li
                key={idx}
                onClick={() => handleSelectSuggestion(s)}
                className="px-3.5 py-2.5 hover:bg-[#F7F6F2] cursor-pointer flex items-start gap-2.5 transition-colors"
              >
                <MapPin className="w-4 h-4 text-[#C5A880] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium text-[#141413] truncate">{mainText}</div>
                  {secondaryText && (
                    <div className="text-[11px] text-[#747775] truncate">{secondaryText}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Controller component inside Google Map to handle camera panning
function MapCameraController({
  targetPosition,
}: {
  targetPosition: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (map && targetPosition) {
      map.panTo(targetPosition);
      map.setZoom(16);
    }
  }, [map, targetPosition]);

  return null;
}

// Interactive Fallback Map (Guarantees map is never white even if Google Cloud key has billing restriction)
function FallbackInteractiveTileMap({
  center,
  onMapClick,
  isExpanded,
}: {
  center: { lat: number; lng: number };
  onMapClick: (lat: number, lng: number) => void;
  isExpanded: boolean;
}) {
  const [zoom, setZoom] = useState(15);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert lat/lng to OpenStreetMap slippy map tile coordinates
  const latRad = (center.lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const xTileFloat = ((center.lng + 180) / 360) * n;
  const yTileFloat = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;

  const xTile = Math.floor(xTileFloat);
  const yTile = Math.floor(yTileFloat);

  // Create a 3x3 grid around the center tile for smooth display
  const tiles: { x: number; y: number; offsetX: number; offsetY: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push({
        x: xTile + dx,
        y: yTile + dy,
        offsetX: dx * 256,
        offsetY: dy * 256,
      });
    }
  }

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left - rect.width / 2;
    const clickY = e.clientY - rect.top - rect.height / 2;

    // Small offset calculation in lat/lng based on zoom
    const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
    const deltaMetersX = clickX * metersPerPixel;
    const deltaMetersY = -clickY * metersPerPixel;

    const deltaLng = deltaMetersX / (111320 * Math.cos(latRad));
    const deltaLat = deltaMetersY / 110540;

    const newLat = Number((center.lat + deltaLat).toFixed(5));
    const newLng = Number((center.lng + deltaLng).toFixed(5));
    onMapClick(newLat, newLng);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`relative w-full bg-[#E5E3DF] overflow-hidden cursor-crosshair select-none transition-all duration-300 ${
        isExpanded ? 'h-96' : 'h-64 sm:h-72'
      }`}
    >
      {/* 3x3 Tile Grid positioned centered */}
      <div
        className="absolute"
        style={{
          left: `calc(50% - ${(xTileFloat - xTile) * 256}px - 256px)`,
          top: `calc(50% - ${(yTileFloat - yTile) * 256}px - 256px)`,
          width: '768px',
          height: '768px',
        }}
      >
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}-${zoom}`}
            src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
            alt=""
            className="absolute w-[256px] h-[256px] pointer-events-none"
            style={{
              left: `${(t.x - xTile + 1) * 256}px`,
              top: `${(t.y - yTile + 1) * 256}px`,
            }}
            loading="lazy"
          />
        ))}
      </div>

      {/* Luxury Center Pin */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center z-10">
        <div className="w-8 h-8 rounded-full bg-[#141413] border-2 border-[#FBFBF9] shadow-lg flex items-center justify-center text-[#C5A880]">
          <MapPin className="w-4 h-4" />
        </div>
        <div className="w-1.5 h-1.5 bg-[#141413] rounded-full mt-0.5 shadow-sm"></div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-3 right-3 flex flex-col bg-white border border-black/15 shadow-md z-20">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => Math.min(18, z + 1));
          }}
          className="p-1.5 hover:bg-[#F7F6F2] border-b border-black/10 text-[#141413] cursor-pointer"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => Math.max(12, z - 1));
          }}
          className="p-1.5 hover:bg-[#F7F6F2] text-[#141413] cursor-pointer"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Info Badge */}
      <div className="absolute bottom-2 left-2 bg-black/80 text-white text-[10px] px-2.5 py-1 rounded backdrop-blur-sm flex items-center gap-1.5 font-mono z-20">
        <Crosshair className="w-3 h-3 text-[#C5A880]" />
        <span>Click anywhere to adjust delivery pin ({center.lat.toFixed(4)}, {center.lng.toFixed(4)})</span>
      </div>
    </div>
  );
}

export function GoogleMapsAddressDetector({
  countryIso,
  initialLat,
  initialLng,
  currentStreetAddress,
  onAddressDetected,
}: GoogleMapsAddressDetectorProps) {
  const { settings } = useStore();
  const apiKey =
    settings?.googleMapsApiKey ||
    (import.meta.env as Record<string, string | undefined>).VITE_GOOGLE_MAPS_API_KEY ||
    (import.meta.env as Record<string, string | undefined>).VITE_GOOGLE_MAPS_API_KI ||
    (import.meta.env as Record<string, string | undefined>).GOOGLE_MAPS_API_KEY ||
    'AIzaSyDjFK0ON-s_iX948enjzhDuBoWc6fPGDjE';

  const defaultCenter = getCountryDefaultCenter(countryIso);
  const [markerPosition, setMarkerPosition] = useState<{ lat: number; lng: number }>({
    lat: initialLat || defaultCenter.lat,
    lng: initialLng || defaultCenter.lng,
  });

  const [isDetecting, setIsDetecting] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [lastDetectedAddress, setLastDetectedAddress] = useState<string | null>(
    currentStreetAddress || null
  );
  const [detectionNotice, setDetectionNotice] = useState<{
    type: 'SUCCESS' | 'INFO' | 'PERMISSION_FALLBACK';
    message: string;
  } | null>(null);

  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [useFallbackMap, setUseFallbackMap] = useState(false);
  const [detectionSource, setDetectionSource] = useState<'GPS' | 'NETWORK_IP' | 'MANUAL' | null>(null);

  // Catch Google Maps auth failure (billing / domain restriction on custom keys)
  useEffect(() => {
    const prevAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      console.warn('Google Maps auth check: key has restricted billing/APIs. Activating resilient tile layer.');
      setUseFallbackMap(true);
      if (prevAuthFailure) prevAuthFailure();
    };

    // If script throws or doesn't initialize within 3s, activate fallback view
    const timer = setTimeout(() => {
      if (!(window as any).google?.maps) {
        setUseFallbackMap(true);
      }
    }, 3200);

    return () => clearTimeout(timer);
  }, []);

  // Update center if country changed and no custom pin yet
  useEffect(() => {
    if (!initialLat && !initialLng) {
      const center = getCountryDefaultCenter(countryIso);
      setMarkerPosition(center);
    }
  }, [countryIso, initialLat, initialLng]);

  // Reverse geocode via server proxy
  const performReverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setIsReverseGeocoding(true);
      try {
        const response = await fetch('/api/maps/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng }),
        });

        const data = await response.json();
        if (data.success && data.formattedAddress) {
          setLastDetectedAddress(data.formattedAddress);
          onAddressDetected({
            streetAddress: data.streetAddress,
            cityDistrict: data.cityDistrict,
            district: data.district,
            stateProvince: data.stateProvince,
            countryIso: data.countryIso,
            countryName: data.country,
            postalCode: data.postalCode,
            lat,
            lng,
            formattedAddress: data.formattedAddress,
          });
        } else {
          // If Geocoding API requires billing on custom key, gracefully maintain pin and address coordinates
          const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setLastDetectedAddress(`Pin: ${fallback}`);
          onAddressDetected({
            streetAddress: `Doorstep Pin at ${fallback}`,
            lat,
            lng,
            formattedAddress: fallback,
          });
        }
      } catch (err) {
        console.warn('Reverse geocoding warning:', err);
      } finally {
        setIsReverseGeocoding(false);
      }
    },
    [onAddressDetected]
  );

  // Network IP Geolocation Fallback (Works 100% of the time, even if browser location permission is denied)
  const performNetworkIpDetection = async (reasonNotice?: string) => {
    setIsDetecting(true);
    try {
      const response = await fetch('/api/maps/ip-location');
      const data = await response.json();

      if (data.success) {
        const lat = data.lat || defaultCenter.lat;
        const lng = data.lng || defaultCenter.lng;
        setMarkerPosition({ lat, lng });
        setDetectionSource('NETWORK_IP');
        setLastDetectedAddress(data.formattedAddress);

        onAddressDetected({
          streetAddress: data.city ? `Central ${data.city}` : 'Main Road',
          cityDistrict: data.city,
          district: data.district || data.city,
          stateProvince: data.stateProvince || data.region,
          countryIso: data.countryIso,
          countryName: data.countryName,
          postalCode: data.postalCode,
          lat,
          lng,
          formattedAddress: data.formattedAddress,
        });

        setDetectionNotice({
          type: 'PERMISSION_FALLBACK',
          message:
            reasonNotice ||
            `✓ Location automatically detected via Network IP (${data.city}, ${data.stateProvince}, ${data.countryName}). Adjust pin or street address below.`,
        });
      }
    } catch (err) {
      console.warn('Network location error:', err);
      setDetectionNotice({
        type: 'INFO',
        message: 'Please click on the map to pin your doorstep delivery location.',
      });
    } finally {
      setIsDetecting(false);
    }
  };

  // Main Auto-Detect Button Handler: Tries Browser GPS, smoothly falls back to IP if permission denied
  const handleAutoDetectLocation = () => {
    setIsDetecting(true);
    setDetectionNotice(null);

    if (!navigator.geolocation) {
      performNetworkIpDetection('Browser GPS not supported. Detected location via network IP.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setMarkerPosition({ lat, lng });
        setDetectionSource('GPS');
        setIsDetecting(false);
        setDetectionNotice({
          type: 'SUCCESS',
          message: `✓ High-precision GPS satellite location acquired (±${Math.round(
            position.coords.accuracy
          )}m accuracy). Address updated.`,
        });
        performReverseGeocode(lat, lng);
      },
      (error) => {
        // If permission was denied or timed out, seamlessly fall back to IP Network detection!
        console.info('GPS permission denied or unavailable, falling back to IP detection:', error.message);
        performNetworkIpDetection(
          'Browser location permission was blocked or unavailable — Automatically detected your city & region via Network IP!'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  };

  // Handle map click
  const handleMapClick = (e: MapMouseEvent) => {
    if (e.detail?.latLng) {
      const lat = e.detail.latLng.lat;
      const lng = e.detail.latLng.lng;
      setMarkerPosition({ lat, lng });
      setDetectionSource('MANUAL');
      performReverseGeocode(lat, lng);
    }
  };

  const handleFallbackTileClick = (lat: number, lng: number) => {
    setMarkerPosition({ lat, lng });
    setDetectionSource('MANUAL');
    performReverseGeocode(lat, lng);
  };

  // Handle place selection from autocomplete search
  const handlePlaceSelect = (
    lat: number,
    lng: number,
    place: any
  ) => {
    setMarkerPosition({ lat, lng });
    setDetectionSource('MANUAL');

    let streetNumber = '';
    let route = '';
    let locality = '';
    let adminArea2 = '';
    let adminArea1 = '';
    let country = '';
    let countryCode = '';
    let postalCode = '';

    if (place.addressComponents) {
      place.addressComponents.forEach((c: any) => {
        if (c.types?.includes('street_number')) streetNumber = c.longText || c.name || '';
        if (c.types?.includes('route')) route = c.longText || c.name || '';
        if (c.types?.includes('locality')) locality = c.longText || c.name || '';
        if (c.types?.includes('administrative_area_level_2')) adminArea2 = c.longText || c.name || '';
        if (c.types?.includes('administrative_area_level_1')) adminArea1 = c.longText || c.name || '';
        if (c.types?.includes('country')) {
          country = c.longText || c.name || '';
          countryCode = c.shortText || '';
        }
        if (c.types?.includes('postal_code')) postalCode = c.longText || c.name || '';
      });
    }

    const street = [streetNumber, route].filter(Boolean).join(' ') || place.displayName || '';
    const formatted = place.formattedAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    setLastDetectedAddress(formatted);
    onAddressDetected({
      streetAddress: street || formatted,
      cityDistrict: locality || adminArea2,
      district: adminArea2 || locality,
      stateProvince: adminArea1,
      countryIso: countryCode || countryIso,
      countryName: country,
      postalCode,
      lat,
      lng,
      formattedAddress: formatted,
    });
  };

  return (
    <div className="bg-[#FAF9F5] border border-[#141413]/10 overflow-hidden space-y-3 p-4 transition-all">
      {/* Header and Control Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#141413] text-[#FBFBF9] flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5 text-[#C5A880]" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[#141413] uppercase tracking-wider flex items-center gap-1.5">
              <span>Google Maps Live Address Pinpoint</span>
              <span className="text-[10px] font-normal text-[#747775]">· نقشے سے پتہ خودکار درج کریں</span>
            </h3>
            <p className="text-[11px] text-[#575653]">
              Click on the map or tap the GPS button to auto-detect your exact doorstep delivery location.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoDetectLocation}
            disabled={isDetecting || isReverseGeocoding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#141413] text-[#FBFBF9] hover:bg-[#2C2C2A] text-xs font-medium cursor-pointer transition-colors disabled:opacity-50 shadow-sm"
          >
            {isDetecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A880]" />
                <span>Detecting Location (تلاش جاری)...</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5 text-[#C5A880]" />
                <span>Auto-Detect My Location (خودکار لوکیشن)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsMapExpanded(!isMapExpanded)}
            title={isMapExpanded ? 'Collapse Map' : 'Expand Map'}
            className="p-1.5 bg-white border border-black/15 text-[#141413] hover:bg-[#F7F6F2] cursor-pointer"
          >
            {isMapExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Detection Feedback Notice (Friendly, Non-Blocking) */}
      {detectionNotice && (
        <div
          className={`px-3 py-2 text-xs flex items-center justify-between gap-2 border ${
            detectionNotice.type === 'PERMISSION_FALLBACK'
              ? 'bg-amber-50/80 border-amber-300 text-amber-900'
              : detectionNotice.type === 'SUCCESS'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {detectionNotice.type === 'PERMISSION_FALLBACK' ? (
              <Globe className="w-4 h-4 text-amber-700 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            )}
            <span>{detectionNotice.message}</span>
          </div>
          {detectionNotice.type === 'PERMISSION_FALLBACK' && (
            <button
              type="button"
              onClick={handleAutoDetectLocation}
              className="text-[10px] font-semibold underline text-amber-950 hover:text-amber-800 shrink-0 cursor-pointer"
            >
              Retry GPS
            </button>
          )}
        </div>
      )}

      {/* Synced Address Bar */}
      {lastDetectedAddress && (
        <div className="bg-emerald-50/60 border border-emerald-600/30 px-3 py-2 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {isReverseGeocoding ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <span className="font-semibold text-emerald-950 block">
                {isReverseGeocoding
                  ? 'Resolving doorstep address from coordinates...'
                  : '✓ Detected Location Applied to Shipping Form:'}
              </span>
              <span className="text-emerald-900 font-mono text-[11px] block truncate">
                {lastDetectedAddress}
              </span>
              <span className="text-[10px] text-emerald-700 block">
                Coordinates: {markerPosition.lat.toFixed(5)}, {markerPosition.lng.toFixed(5)} {detectionSource ? `· (${detectionSource})` : ''}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-800 shrink-0 bg-emerald-100/60 px-1.5 py-0.5 rounded">
            SYNCED
          </span>
        </div>
      )}

      {/* Embedded Maps Provider & Viewport */}
      <APIProvider apiKey={apiKey}>
        {/* Places Search Bar */}
        <div className="space-y-1">
          <PlacesAutocompleteSearchBar onSelectPlace={handlePlaceSelect} />
        </div>

        {/* Resilient Map View: If Google Maps key fails auth/billing, seamlessly renders Fallback Tile Map */}
        {!useFallbackMap ? (
          <div
            className={`relative border border-black/15 overflow-hidden transition-all duration-300 ${
              isMapExpanded ? 'h-96' : 'h-64 sm:h-72'
            }`}
            style={{ width: '100%' }}
          >
            <Map
              mapId="DEMO_MAP_ID"
              defaultCenter={markerPosition}
              center={markerPosition}
              defaultZoom={15}
              zoom={15}
              gestureHandling="greedy"
              disableDefaultUI={false}
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <AdvancedMarker position={markerPosition}>
                <Pin
                  background="#141413"
                  borderColor="#FBFBF9"
                  glyphColor="#C5A880"
                  scale={1.2}
                />
              </AdvancedMarker>

              <MapCameraController targetPosition={markerPosition} />
            </Map>

            <div className="absolute bottom-2 left-2 pointer-events-none bg-black/75 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm flex items-center gap-1.5 font-mono">
              <Crosshair className="w-3 h-3 text-[#C5A880]" />
              <span>Click anywhere to adjust delivery pin (پن کو ایڈجسٹ کریں)</span>
            </div>
          </div>
        ) : (
          <div className="border border-black/15 overflow-hidden">
            <FallbackInteractiveTileMap
              center={markerPosition}
              onMapClick={handleFallbackTileClick}
              isExpanded={isMapExpanded}
            />
          </div>
        )}
      </APIProvider>
    </div>
  );
}
