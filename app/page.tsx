import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MapPinIcon, ArrowRightIcon } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative min-h-[60vh] flex flex-col items-center justify-center bg-gradient-to-br from-green-900 via-emerald-800 to-teal-700 text-white px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center opacity-20" />
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">
            🌿 Walkable
          </h1>
          <p className="text-lg md:text-xl text-green-100 mb-8">
            Discover, build and share walking routes in parks around you.
            Check weather, explore trails, and join the community.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/map">
              <Button size="lg" className="bg-white text-green-800 hover:bg-green-50 font-semibold gap-2">
                <MapPinIcon className="h-5 w-5" />
                Explore Map
              </Button>
            </Link>
            <Link href="/routes/builder">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 gap-2">
                Build a Route
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16 grid md:grid-cols-3 gap-8">
        {[
          { emoji: "🗺️", title: "Interactive Map", desc: "Find parks and trails near you with real-time filtering and clustering." },
          { emoji: "🌤️", title: "Weather & Trail Status", desc: "Know before you go — current conditions and 3-day forecast per park." },
          { emoji: "📸", title: "Community Photos", desc: "Share your walks and discover routes through photos from the community." },
        ].map((f) => (
          <div key={f.title} className="text-center p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
            <div className="text-4xl mb-3">{f.emoji}</div>
            <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-muted-foreground text-sm">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="bg-muted/50 py-16 text-center px-4">
        <h2 className="text-2xl font-bold mb-3">Ready to explore?</h2>
        <p className="text-muted-foreground mb-6">Join thousands of walkers and discover your next favourite trail.</p>
        <Link href="/map">
          <Button size="lg" className="gap-2">
            Get Started <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </Link>
      </section>
    </main>
  );
}
