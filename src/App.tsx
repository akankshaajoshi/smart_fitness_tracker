import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, MapPin, Wifi, WifiOff, Activity, Clock, Navigation } from 'lucide-react';

interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number;
}

interface NetworkInfo {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

interface WorkoutStats {
  duration: number;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  points: LocationPoint[];
}

function App() {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [route, setRoute] = useState<LocationPoint[]>([]);
  const [workoutStats, setWorkoutStats] = useState<WorkoutStats>({
    duration: 0,
    distance: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    points: []
  });
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [locationError, setLocationError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const watchIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const backgroundTasksRef = useRef<Set<number>>(new Set());
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);

  // Network Information API
  useEffect(() => {
    const updateNetworkInfo = () => {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        setNetworkInfo({
          effectiveType: connection.effectiveType || 'unknown',
          downlink: connection.downlink || 0,
          rtt: connection.rtt || 0,
          saveData: connection.saveData || false
        });
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    updateNetworkInfo();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', updateNetworkInfo);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if ('connection' in navigator) {
        (navigator as any).connection.removeEventListener('change', updateNetworkInfo);
      }
    };
  }, []);

  // Background Tasks API
  const scheduleBackgroundTask = useCallback((task: () => void) => {
    if ('requestIdleCallback' in window) {
      const taskId = requestIdleCallback(task, { timeout: 5000 });
      backgroundTasksRef.current.add(taskId);
      return taskId;
    } else {
      // Fallback for browsers without requestIdleCallback
      const taskId = setTimeout(task, 0);
      backgroundTasksRef.current.add(taskId);
      return taskId;
    }
  }, []);

  // Calculate distance between two points
  const calculateDistance = (point1: LocationPoint, point2: LocationPoint): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const intervalRef = useRef<number | null>(null);

useEffect(() => {
  if (isTracking && !isPaused) {
    intervalRef.current = window.setInterval(() => {
      setWorkoutStats(prev => ({
        ...prev,
        duration: ((Date.now() - (startTimeRef.current || Date.now())) / 1000)
      }));
    }, 1000);
  }

  return () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
}, [isTracking, isPaused]);

  // Canvas API - Draw route
  const drawRoute = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || route.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    scheduleBackgroundTask(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set up canvas styling
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Find bounds
      const lats = route.map(p => p.lat);
      const lngs = route.map(p => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const padding = 20;
      const scaleX = (canvas.width - padding * 2) / (maxLng - minLng || 1);
      const scaleY = (canvas.height - padding * 2) / (maxLat - minLat || 1);

      // Draw route
      ctx.beginPath();
      route.forEach((point, index) => {
        const x = padding + (point.lng - minLng) * scaleX;
        const y = canvas.height - padding - (point.lat - minLat) * scaleY;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw start point
      if (route.length > 0) {
        const startPoint = route[0];
        const startX = padding + (startPoint.lng - minLng) * scaleX;
        const startY = canvas.height - padding - (startPoint.lat - minLat) * scaleY;
        
        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(startX, startY, 6, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Draw current position
      if (currentLocation) {
        const currentX = padding + (currentLocation.lng - minLng) * scaleX;
        const currentY = canvas.height - padding - (currentLocation.lat - minLat) * scaleY;
        
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(currentX, currentY, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // Pulse effect
        ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.beginPath();
        ctx.arc(currentX, currentY, 15, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }, [route, currentLocation, scheduleBackgroundTask]);

  // Update workout statistics
  const updateStats = useCallback(() => {
    if (!startTimeRef.current) return;

    scheduleBackgroundTask(() => {
      const duration = (Date.now() - startTimeRef.current!) / 1000;
      let totalDistance = 0;
      let maxSpeed = 0;
      const speeds: number[] = [];

      for (let i = 1; i < route.length; i++) {
        const distance = calculateDistance(route[i - 1], route[i]);
        totalDistance += distance;
        
        const timeDiff = (route[i].timestamp - route[i - 1].timestamp) / 1000;
        const speed = distance / timeDiff * 3600; // km/h
        
        speeds.push(speed);
        if (speed > maxSpeed) maxSpeed = speed;
      }

      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

      setWorkoutStats({
        duration,
        distance: totalDistance,
        avgSpeed,
        maxSpeed,
        points: route
      });
    });
  }, [route, scheduleBackgroundTask]);

  // Geolocation API
  const startTracking = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported');
      return;
    }

    setIsTracking(true);
    setIsPaused(false);
    setLocationError(null);
    startTimeRef.current = Date.now();

    // Adjust tracking frequency based on network quality
    const getTrackingOptions = () => {
      if (!networkInfo) return { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 };
      
      if (networkInfo.effectiveType === 'slow-2g' || networkInfo.saveData) {
        return { enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 };
      } else if (networkInfo.effectiveType === '2g') {
        return { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 };
      } else {
        return { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 };
      }
    };

    const options = getTrackingOptions();

    const success = (position: GeolocationPosition) => {
      const newPoint: LocationPoint = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: Date.now(),
        speed: position.coords.speed || undefined
      };

      setCurrentLocation(newPoint);
      
      if (!isPaused) {
        setRoute(prev => [...prev, newPoint]);
      }
    };

    const error = (err: GeolocationPositionError) => {
      setLocationError(err.message);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(success, error, options);
  };

  const pauseTracking = () => {
    setIsPaused(true);
  };

  const resumeTracking = () => {
    setIsPaused(false);
  };

  const stopTracking = () => {
    setIsTracking(false);
    setIsPaused(false);
    
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  // Intersection Observer API
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    intersectionObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in');
        }
      });
    }, observerOptions);

    const observeElements = () => {
      const elements = document.querySelectorAll('.observe-intersection');
      elements.forEach(el => {
        intersectionObserverRef.current?.observe(el);
      });
    };

    observeElements();

    return () => {
      intersectionObserverRef.current?.disconnect();
    };
  }, []);

  // Update canvas and stats
  useEffect(() => {
    drawRoute();
    updateStats();
  }, [route, currentLocation, drawRoute, updateStats]);

  // Cleanup background tasks
  useEffect(() => {
    return () => {
      backgroundTasksRef.current.forEach(taskId => {
        if ('cancelIdleCallback' in window) {
          cancelIdleCallback(taskId);
        } else {
          clearTimeout(taskId);
        }
      });
      backgroundTasksRef.current.clear();
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDistance = (km: number): string => {
    return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(2)}km`;
  };

  const formatSpeed = (kmh: number): string => {
    return `${kmh.toFixed(1)} km/h`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 observe-intersection">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            <Activity className="inline-block mr-2 text-blue-600" size={40} />
            Smart Fitness Tracker
          </h1>
          <p className="text-gray-600">Network-aware location tracking with performance optimization</p>
        </div>

        {/* Network Status */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 observe-intersection">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isOnline ? (
                <Wifi className="text-green-500" size={20} />
              ) : (
                <WifiOff className="text-red-500" size={20} />
              )}
              <span className="font-medium">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            {networkInfo && (
              <div className="text-sm text-gray-600">
                {networkInfo.effectiveType} • {networkInfo.downlink}Mbps
                {networkInfo.saveData && <span className="text-orange-500 ml-2">Data Saver</span>}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Map Canvas */}
          <div className="bg-white rounded-lg shadow-md p-6 observe-intersection">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <MapPin className="mr-2 text-blue-600" size={20} />
              Route Map
            </h2>
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={400}
                height={300}
                className="w-full h-64 bg-gray-50 rounded-lg border"
              />
              {route.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  Start tracking to see your route
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-lg shadow-md p-6 observe-intersection">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Navigation className="mr-2 text-blue-600" size={20} />
              Tracking Controls
            </h2>
            
            <div className="flex flex-col space-y-4">
              {!isTracking ? (
                <button
                  onClick={startTracking}
                  className="bg-green-500 hover:bg-green-600 text-white py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center"
                >
                  <Play className="mr-2" size={20} />
                  Start Tracking
                </button>
              ) : (
                <div className="flex space-x-3">
                  {!isPaused ? (
                    <button
                      onClick={pauseTracking}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center flex-1"
                    >
                      <Pause className="mr-2" size={20} />
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={resumeTracking}
                      className="bg-green-500 hover:bg-green-600 text-white py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center flex-1"
                    >
                      <Play className="mr-2" size={20} />
                      Resume
                    </button>
                  )}
                  <button
                    onClick={stopTracking}
                    className="bg-red-500 hover:bg-red-600 text-white py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center flex-1"
                  >
                    <Square className="mr-2" size={20} />
                    Stop
                  </button>
                </div>
              )}
            </div>

            {locationError && (
              <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700">
                {locationError}
              </div>
            )}

            {isPaused && (
              <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg text-yellow-700">
                Tracking paused
              </div>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6 observe-intersection">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Clock className="mr-2 text-blue-600" size={20} />
            Workout Statistics
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{formatTime(workoutStats.duration)}</div>
              <div className="text-sm text-gray-600">Duration</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{formatDistance(workoutStats.distance)}</div>
              <div className="text-sm text-gray-600">Distance</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{formatSpeed(workoutStats.avgSpeed)}</div>
              <div className="text-sm text-gray-600">Avg Speed</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{formatSpeed(workoutStats.maxSpeed)}</div>
              <div className="text-sm text-gray-600">Max Speed</div>
            </div>
          </div>
        </div>

        {/* Current Location */}
        {currentLocation && (
          <div className="mt-6 bg-white rounded-lg shadow-md p-6 observe-intersection">
            <h2 className="text-xl font-semibold mb-4">Current Location</h2>
            <div className="text-sm text-gray-600">
              <p>Latitude: {currentLocation.lat.toFixed(6)}</p>
              <p>Longitude: {currentLocation.lng.toFixed(6)}</p>
              {currentLocation.speed && (
                <p>Speed: {formatSpeed(currentLocation.speed * 3.6)}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .animate-fade-in {
          animation: fadeIn 0.6s ease-in-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default App;