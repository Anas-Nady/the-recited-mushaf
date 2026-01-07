export type Episode = {
  id: string;
  title: string;
  reciter: string;
  surah: string;
  url: string;
  image: string;
  duration: string;
};

export async function getPodcastEpisodes(): Promise<Episode[]> {
  const RSS_URL = "https://anchor.fm/s/c665db20/podcast/rss";

  try {
    const res = await fetch(RSS_URL, { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error("Failed to fetch RSS");
    const xmlText = await res.text();

    // Basic Regex Parsing (Better than DOMParser for Node environment without heavy libs)
    // Warning: Robust production apps should use 'fast-xml-parser' or 'rss-parser' package.
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items: Episode[] = [];
    let match;

    // Default image if specific episode image fails
    const channelImageMatch = xmlText.match(/<itunes:image href="(.*?)"/);
    const channelImage = channelImageMatch ? channelImageMatch[1] : "";

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const content = match[1];

      // Extract Title
      const titleMatch =
        content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
        content.match(/<title>(.*?)<\/title>/);
      const fullTitle = titleMatch ? titleMatch[1] : "Unknown Title";

      // Split Title: "Surah Name | Reciter Name" or "Surah Name - Reciter Name"
      // Normalize separators by replacing " - " with " | " then splitting
      const parts = fullTitle
        .replace(/ - /g, " | ")
        .split("|")
        .map((s) => s.trim());

      let surah = "";
      let reciter = "";

      const arabicSurahIndex = parts.findIndex((p) => p.includes("سورة"));
      if (arabicSurahIndex !== -1) {
        surah = parts[arabicSurahIndex];
      }

      const englishSurahIndex = parts.findIndex((p) =>
        p.toLowerCase().includes("surah")
      );
      if (!surah && englishSurahIndex !== -1) {
        surah = parts[englishSurahIndex];
      }

      const reciterParts = parts.filter(
        (_, i) => i !== arabicSurahIndex && i !== englishSurahIndex
      );
      reciter = reciterParts.join(" ").trim();

      if (!surah && parts.length > 0) {
        surah = parts[0];
        reciter = parts.slice(1).join(" ");
      }

      if (!reciter || reciter === "القارئ غير معروف" || reciter === "Unknown") {
        reciter = "تلاوات عامة";
      }

      const enclosureMatch = content.match(/<enclosure url="(.*?)"/);
      const url = enclosureMatch ? enclosureMatch[1] : "";

      // Extract GUID (for key)
      const guidMatch = content.match(/<guid.*?>(.*?)<\/guid>/);
      const id = guidMatch ? guidMatch[1] : Math.random().toString();

      // Extract Image
      const imgMatch = content.match(/<itunes:image href="(.*?)"/);
      const image = imgMatch ? imgMatch[1] : channelImage;

      // Extract Duration
      const durationMatch = content.match(
        /<itunes:duration>(.*?)<\/itunes:duration>/
      );
      const duration = durationMatch ? durationMatch[1] : "00:00";

      if (url) {
        items.push({
          id,
          title: fullTitle,
          surah,
          reciter,
          url,
          duration,
          image,
        });
      }
    }

    return items;
  } catch (error) {
    console.error(error);
    return [];
  }
}
