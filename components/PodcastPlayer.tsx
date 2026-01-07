"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Loader2,
  Search,
  Music,
} from "lucide-react";
import { getSurahOrder } from "@/utils/surahOrder";
import { getPodcastEpisodes } from "@/actions/getPodcastEpisodes";

// --- Types ---
type Episode = {
  id: string;
  title: string;
  reciter: string;
  surah: string;
  url: string;
  image: string;
  duration: string;
};

type Props = {
  episodes?: Episode[];
};
const EMPTY_EPISODES: Episode[] = [];

export default function PodcastPlayer({
  episodes: initialEpisodes = EMPTY_EPISODES,
}: Props) {
  // --- State ---
  const [episodes, setEpisodes] = useState<Episode[]>(initialEpisodes);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedReciter, setSelectedReciter] = useState<string>("All");

  // Search State
  const [reciterSearch, setReciterSearch] = useState("");
  const [surahSearch, setSurahSearch] = useState("");

  // UI State
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Audio State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Pagination State
  const ITEMS_PER_PAGE = 10;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const audioRef = useRef<HTMLAudioElement>(null);
  const shouldSeekRef = useRef<number | null>(null);

  // --- Helpers ---

  // Normalize Arabic text for search
  const normalizeArabic = (text: string) => {
    return text
      .replace(/([أإآ])/g, "ا")
      .replace(/(ة)/g, "ه")
      .replace(/(ى)/g, "ي")
      .replace(/[\u064B-\u065F]/g, "") // Remove diacritics
      .toLowerCase();
  };

  // Create Regex for flexible Arabic search
  const createSearchRegex = (query: string) => {
    const normalized = normalizeArabic(query);
    // Escape special regex chars just in case, though we primarily have Arabic letters
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Allow for some flexibility (optional) - for now exact match on normalized string
    return new RegExp(escaped, "i");
  };

  // --- Effects ---

  // --- Effects ---

  // 0. Data Fetching & Caching
  // 0. Data Fetching
  useEffect(() => {
    const loadEpisodes = async () => {
      if (initialEpisodes.length > 0) return;

      // Fetch from Server Action
      try {
        const fetchedEpisodes = await getPodcastEpisodes();
        setEpisodes(fetchedEpisodes);
      } catch (error) {
        console.error("Failed to fetch episodes", error);
      }
    };

    loadEpisodes();
  }, [initialEpisodes]);

  // 1. Initialize from LocalStorage and URL
  useEffect(() => {
    // Restore Playback State
    const savedState = localStorage.getItem("podcast_state");
    if (savedState) {
      try {
        const { id, time } = JSON.parse(savedState);
        if (id) {
          setCurrentId(id);
          shouldSeekRef.current = Math.max(0, time - 5);
        }
      } catch (e) {
        console.error("Failed to parse playback state", e);
      }
    }

    // Check URL first
    const params = new URLSearchParams(window.location.search);
    const urlReciter = params.get("reciter");

    if (urlReciter) {
      // Verify if reciter exists
      const exists = episodes.some((e) => e.reciter === urlReciter);
      if (exists) {
        setSelectedReciter(urlReciter);
        return;
      }
    }

    // Fallback to LocalStorage
    const savedReciter = localStorage.getItem("selectedReciter");
    if (savedReciter) {
      const exists = episodes.some((e) => e.reciter === savedReciter);
      if (exists) {
        setSelectedReciter(savedReciter);
      }
    }
  }, [episodes]);

  // 2. Persist to LocalStorage and URL
  useEffect(() => {
    if (selectedReciter) {
      localStorage.setItem("selectedReciter", selectedReciter);

      // Update URL without reloading
      const url = new URL(window.location.href);
      if (selectedReciter === "All") {
        url.searchParams.delete("reciter");
      } else {
        url.searchParams.set("reciter", selectedReciter);
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, [selectedReciter]);

  // 3. Dark Mode Initialization
  useEffect(() => {
    // Check system preference or local storage for theme
    // For now, default to light, but let's check system
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      setIsDarkMode(true);
    }
  }, []);

  // --- Data Processing (Memoized) ---

  // 1. Get Unique Reciters with their Images (Filtered by Reciter Search)
  const reciters = useMemo(() => {
    const map = new Map();
    episodes.forEach((ep) => {
      if (!map.has(ep.reciter)) {
        map.set(ep.reciter, ep.image);
      }
    });

    let allReciters = Array.from(map.entries()).map(([name, image]) => ({
      name,
      image,
    }));

    if (reciterSearch) {
      const regex = createSearchRegex(reciterSearch);
      allReciters = allReciters.filter(
        (r) =>
          regex.test(normalizeArabic(r.name)) ||
          r.name.toLowerCase().includes(reciterSearch.toLowerCase())
      );
    }

    return allReciters;
  }, [episodes, reciterSearch]);

  // 2. Filter Episodes (By Reciter AND Surah Search)
  const filteredEpisodes = useMemo(() => {
    let result = episodes;

    // Filter by Reciter
    if (selectedReciter !== "All") {
      result = result.filter((e) => e.reciter === selectedReciter);
    }

    // Filter by Surah/Reciter Smart Search
    if (surahSearch) {
      const normalizedQuery = normalizeArabic(surahSearch);
      const queryTerms = normalizedQuery.split(" ").filter((t) => t.length > 0);

      result = result.filter((e) => {
        const normalizedSurah = normalizeArabic(e.surah);
        const normalizedReciter = normalizeArabic(e.reciter);
        const combined = `${normalizedSurah} ${normalizedReciter}`;

        // Check if ALL terms are present in the combined string
        return queryTerms.every((term) => combined.includes(term));
      });
    }

    // Sort by Surah Order
    return result.sort((a, b) => {
      const orderA = getSurahOrder(a.surah);
      const orderB = getSurahOrder(b.surah);
      return orderA - orderB;
    });
  }, [selectedReciter, episodes, surahSearch]);

  // 3. Paginated List
  const visibleEpisodes = filteredEpisodes.slice(0, visibleCount);

  // 4. Current Episode Object
  const currentEpisode = episodes.find((e) => e.id === currentId);

  // --- Handlers ---

  const handlePlayPause = (id: string) => {
    if (currentId === id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentId(id);
      setIsPlaying(true);
      setIsLoadingAudio(true);
      setCurrentTime(0);
      shouldSeekRef.current = null;
    }
  };

  const handleNext = () => {
    if (!currentId) return;
    const currentIndex = filteredEpisodes.findIndex((e) => e.id === currentId);
    if (currentIndex < filteredEpisodes.length - 1) {
      handlePlayPause(filteredEpisodes[currentIndex + 1].id);
    }
  };

  const handlePrev = () => {
    if (!currentId) return;
    const currentIndex = filteredEpisodes.findIndex((e) => e.id === currentId);
    if (currentIndex > 0) {
      handlePlayPause(filteredEpisodes[currentIndex - 1].id);
    }
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  };

  const onReciterSelect = (reciterName: string) => {
    setSelectedReciter(reciterName);
    setVisibleCount(ITEMS_PER_PAGE);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // --- Audio Events ---

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      if (isPlaying && currentEpisode) {
        audioRef.current.play().catch((e) => console.error("Play Error", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [currentId, isPlaying, volume, isMuted, currentEpisode]);

  const onTimeUpdate = () => {
    if (audioRef.current && !isLoadingAudio) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      setDuration(audioRef.current.duration || 0);

      // Save to local storage
      if (currentId) {
        localStorage.setItem(
          "podcast_state",
          JSON.stringify({ id: currentId, time })
        );
      }
    }
  };

  const onLoadedData = () => {
    setIsLoadingAudio(false);
    if (shouldSeekRef.current !== null && audioRef.current) {
      audioRef.current.currentTime = shouldSeekRef.current;
      setCurrentTime(shouldSeekRef.current);
      shouldSeekRef.current = null;
    }
    if (isPlaying) audioRef.current?.play();
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  // --- Dynamic Styles ---
  const theme = isDarkMode
    ? {
        bg: "bg-slate-900",
        text: "text-slate-100",
        cardBg: "bg-slate-800",
        cardBorder: "border-slate-700",
        subText: "text-slate-400",
        accent: "text-emerald-400",
        accentBg: "bg-emerald-900/30",
        inputBg: "bg-slate-700",
        inputBorder: "border-slate-600",
      }
    : {
        bg: "bg-slate-50",
        text: "text-slate-900",
        cardBg: "bg-white",
        cardBorder: "border-slate-100",
        subText: "text-slate-500",
        accent: "text-emerald-600",
        accentBg: "bg-emerald-50",
        inputBg: "bg-white",
        inputBorder: "border-slate-200",
      };

  return (
    <div
      className={`min-h-screen font-sans pb-32 transition-colors duration-300 ${theme.bg} ${theme.text}`}
      dir="rtl"
    >
      {/* Audio Element */}
      <audio
        ref={audioRef}
        src={currentEpisode?.url}
        onTimeUpdate={onTimeUpdate}
        onLoadedData={onLoadedData}
        onEnded={handleNext}
      />

      {/* --- HEADER --- */}
      <header className="bg-gradient-to-l from-emerald-600 to-teal-800 text-white pt-8 pb-20 px-6 shadow-xl rounded-b-[3rem] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-white rounded-full blur-3xl"></div>
          <div className="absolute top-20 -left-20 w-40 h-40 bg-emerald-300 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-4xl mx-auto flex justify-between items-center relative z-10">
          <div className="flex items-center gap-4">
            <img
              src="https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/33185640/33185640-1699617420698-af08d26cdc989.jpg"
              alt="Logo"
              className="w-32 h-32 rounded-2xl shadow-lg border-2 border-white/20 object-cover"
            />
            <div>
              <h1 className="text-4xl font-extrabold mb-2 tracking-tight drop-shadow-sm">
                المصحف المرتل
              </h1>
              <p className="text-emerald-100 text-base font-light opacity-90">
                تلاوات خاشعة بأعذب الأصوات
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="bg-white/10 hover:bg-white/20 p-3 rounded-full backdrop-blur-md transition-all cursor-pointer"
              title="تبديل الوضع الليلي"
            >
              {isDarkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 -mt-12 relative z-10">
        {/* --- RECITER SELECTION SECTION --- */}
        <section
          className={`${theme.cardBg} rounded-3xl shadow-lg p-6 mb-8 border ${theme.cardBorder} transition-colors duration-300`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-emerald-500" />
              <h2
                className={`text-base font-bold uppercase tracking-wider ${theme.subText}`}
              >
                اختر القارئ
              </h2>
            </div>

            {/* Reciter Search Input */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="ابحث عن قارئ..."
                value={reciterSearch}
                onChange={(e) => setReciterSearch(e.target.value)}
                className={`w-full py-2 pr-10 pl-4 rounded-full text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${theme.inputBg} ${theme.inputBorder} border ${theme.text}`}
              />
              <Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>

          <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide snap-x pt-2">
            {/* "All" Option */}
            <div
              onClick={() => onReciterSelect("All")}
              className="flex flex-col items-center gap-3 min-w-[90px] cursor-pointer group snap-start"
            >
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold transition-all duration-300 shadow-sm
                 ${
                   selectedReciter === "All"
                     ? "bg-emerald-600 text-white ring-4 ring-emerald-100/50 scale-110 shadow-emerald-200"
                     : `${
                         isDarkMode
                           ? "bg-slate-700 text-slate-300"
                           : "bg-slate-100 text-slate-400"
                       } group-hover:bg-slate-200 dark:group-hover:bg-slate-600`
                 }`}
              >
                الكل
              </div>
              <span
                className={`text-sm font-medium text-center ${
                  selectedReciter === "All"
                    ? "text-emerald-600 font-bold"
                    : theme.subText
                }`}
              >
                كل القراء
              </span>
            </div>

            {/* Reciter List */}
            {reciters.map((r) => (
              <div
                key={r.name}
                onClick={() => onReciterSelect(r.name)}
                className="flex flex-col items-center gap-3 min-w-[90px] max-w-[100px] cursor-pointer group snap-start"
              >
                <div
                  className={`relative w-20 h-20 rounded-full overflow-hidden transition-all duration-300 border-2 shadow-sm
                   ${
                     selectedReciter === r.name
                       ? "border-emerald-600 ring-4 ring-emerald-100/50 scale-110 grayscale-0 shadow-emerald-200"
                       : "border-transparent grayscale group-hover:grayscale-0"
                   }`}
                >
                  <img
                    src={
                      r.name === "تلاوات عامة"
                        ? "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/33185640/33185640-1699617420698-af08d26cdc989.jpg"
                        : r.image
                    }
                    onError={(e) => {
                      // Fallback if image fails or if it's "تلاوات عامة" and we want a specific logo
                      if (r.name === "تلاوات عامة") {
                        // You mentioned "add logo of show on page and also on Public Surah تلاوات عامة"
                        // Assuming the feed image is correct, but if you want to force a logo:
                        (e.target as HTMLImageElement).src =
                          "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/33185640/33185640-1699617420698-af08d26cdc989.jpg";
                      }
                    }}
                    alt={r.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span
                  className={`text-sm font-medium text-center truncate w-full px-1 ${
                    selectedReciter === r.name
                      ? "text-emerald-600 font-bold"
                      : theme.subText
                  }`}
                >
                  {r.name}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* --- EPISODE LIST SECTION --- */}
        <section className="space-y-4">
          {/* Surah Search Input */}
          <div className="relative mb-6">
            <input
              type="text"
              placeholder="ابحث عن سورة أو قارئ..."
              value={surahSearch}
              onChange={(e) => setSurahSearch(e.target.value)}
              className={`w-full py-3 pr-12 pl-4 rounded-xl text-base outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm ${theme.cardBg} ${theme.text} border ${theme.cardBorder}`}
            />
            <Search
              size={20}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500"
            />
          </div>

          {visibleEpisodes.map((ep) => {
            const active = currentId === ep.id;
            return (
              <div
                key={ep.id}
                onClick={() => handlePlayPause(ep.id)}
                className={`group relative flex items-center gap-5 p-5 rounded-2xl transition-all cursor-pointer border shadow-sm
                  ${
                    active
                      ? `border-emerald-500 shadow-md ${
                          isDarkMode ? "bg-emerald-900/20" : "bg-emerald-50"
                        }`
                      : `${theme.cardBg} ${theme.cardBorder} hover:border-emerald-300 hover:shadow-md`
                  }`}
              >
                {/* Playing Indicator / Image */}
                <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-slate-200 shadow-inner">
                  <img
                    src={ep.reciter === "تلاوات عامة" ? ep.image : ep.image} // Logic for custom logo can be applied here too
                    alt={ep.surah}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity
                    ${
                      active
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {active && isPlaying && !isLoadingAudio ? (
                      <div className="flex gap-[3px] h-5 items-end">
                        <span className="w-1.5 bg-white animate-[bounce_1s_infinite]"></span>
                        <span className="w-1.5 bg-white animate-[bounce_1.2s_infinite]"></span>
                        <span className="w-1.5 bg-white animate-[bounce_0.8s_infinite]"></span>
                      </div>
                    ) : (
                      <Play size={24} className="fill-white text-white ml-1" />
                    )}
                  </div>
                </div>

                {/* Text Info */}
                <div className="flex-1 min-w-0">
                  <h3
                    className={`font-bold text-xl mb-1 truncate ${
                      active ? "text-emerald-600" : theme.text
                    }`}
                  >
                    {ep.surah}
                  </h3>
                  <p className={`text-base truncate ${theme.subText}`}>
                    {ep.reciter}
                  </p>
                </div>

                {/* Status Icon / Duration */}
                <div className="text-slate-300 flex flex-col items-end gap-1">
                  {active && isLoadingAudio ? (
                    <Loader2
                      size={24}
                      className="animate-spin text-emerald-600"
                    />
                  ) : active ? (
                    <div className="text-xs font-bold text-emerald-600 px-3 py-1 bg-emerald-100 rounded-full">
                      تشغيل
                    </div>
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-full ${
                        isDarkMode ? "bg-slate-700" : "bg-slate-50"
                      } flex items-center justify-center group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors`}
                    >
                      <Play size={18} className="ml-1 fill-current" />
                    </div>
                  )}
                  <span className="text-xs font-mono opacity-60">
                    {ep.duration || "00:00"}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {filteredEpisodes.length === 0 && (
            <div className={`text-center py-16 ${theme.subText}`}>
              <p className="text-lg">لا توجد تلاوات تطابق بحثك</p>
              <button
                onClick={() => {
                  setReciterSearch("");
                  setSurahSearch("");
                  setSelectedReciter("All");
                }}
                className="mt-4 text-emerald-500 hover:underline"
              >
                إعادة تعيين البحث
              </button>
            </div>
          )}

          {/* Load More Button */}
          {visibleCount < filteredEpisodes.length && (
            <button
              onClick={handleLoadMore}
              className={`w-full py-4 text-emerald-600 font-bold ${theme.cardBg} border ${theme.cardBorder} rounded-2xl hover:bg-emerald-50 transition-colors shadow-sm mt-6 text-lg`}
            >
              عرض المزيد من التلاوات ({filteredEpisodes.length - visibleCount}{" "}
              متبقي)
            </button>
          )}
        </section>
      </main>

      {/* --- FIXED PLAYER BAR --- */}
      {currentEpisode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-5 duration-300">
          {/* Glassmorphism Background */}
          <div
            className={`${
              isDarkMode
                ? "bg-slate-900/95 border-slate-800"
                : "bg-white/95 border-slate-200"
            } backdrop-blur-xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.15)] pb-safe-area transition-colors duration-300`}
          >
            {/* Progress Bar (Attached to top of player) */}
            <div
              className="relative w-full h-1.5 bg-slate-200/50 group cursor-pointer"
              dir="rtl"
            >
              <div
                className="absolute top-0 right-0 h-full bg-emerald-500 rounded-l-full transition-all duration-100"
                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              />
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={onSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                dir="rtl"
              />
            </div>

            <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-6">
              {/* Info Area */}
              <div className="flex items-center gap-3 md:gap-4 w-full md:flex-1 min-w-0 overflow-hidden">
                <img
                  src={currentEpisode.image}
                  className={`w-14 h-14 rounded-xl object-cover shadow-md border border-slate-100/10 ${
                    isPlaying
                      ? "animate-[spin_10s_linear_infinite] rounded-full"
                      : ""
                  }`}
                  alt="Current"
                />
                <div className="min-w-0">
                  <div
                    className={`font-bold ${theme.text} truncate text-base flex items-center gap-2`}
                  >
                    <span className="marquee-text">{currentEpisode.surah}</span>
                  </div>
                  <div className={`text-sm ${theme.subText} truncate`}>
                    {currentEpisode.reciter}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="w-full md:w-auto flex items-center justify-between md:justify-center gap-3 md:gap-6 flex-none mt-2 md:mt-0">
                {/* Mobile Time (Right in RTL) */}
                <div
                  className="text-[10px] font-mono opacity-70 md:hidden w-[70px] text-right"
                  dir="ltr"
                >
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>

                <div className="flex items-center justify-center gap-6">
                  {/* Next Button (Left in RTL) */}
                  <button
                    onClick={handlePrev}
                    className={`p-2 ${theme.subText} hover:text-emerald-500 transition-colors`}
                    title="السابق"
                  >
                    <SkipForward size={28} className="fill-current" />
                  </button>

                  <button
                    onClick={() => handlePlayPause(currentId!)}
                    className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:scale-110 active:scale-95 transition-all"
                  >
                    {isLoadingAudio ? (
                      <Loader2 size={28} className="animate-spin" />
                    ) : isPlaying ? (
                      <Pause size={28} className="fill-current" />
                    ) : (
                      <Play size={28} className="ml-1 fill-current" />
                    )}
                  </button>

                  {/* Previous Button (Right in RTL) */}
                  <button
                    onClick={handleNext}
                    className={`p-2 ${theme.subText} hover:text-emerald-500 transition-colors`}
                    title="التالي"
                  >
                    <SkipBack size={28} className="fill-current" />
                  </button>
                </div>

                {/* Mobile Spacer (Left in RTL) */}
                <div className="w-[70px] md:hidden"></div>
              </div>

              {/* Volume & Duration (Desktop) */}
              <div className="hidden md:flex items-center justify-end gap-4 w-1/3">
                <div
                  className={`text-xs font-mono font-medium ${theme.subText} ${
                    isDarkMode ? "bg-slate-800" : "bg-slate-100"
                  } px-3 py-1.5 rounded-lg`}
                >
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>

                <div className="flex items-center gap-2 group">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`${theme.subText} hover:text-emerald-500`}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX size={20} />
                    ) : (
                      <Volume2 size={20} />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-20 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
