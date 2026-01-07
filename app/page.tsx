import PodcastPlayer from "@/components/PodcastPlayer";

export const revalidate = 3600 * 24 * 30;

export default function Page() {
  return <PodcastPlayer />;
}
