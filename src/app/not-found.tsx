import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-carbon-950 flex items-center justify-center px-4">
      <div className="text-center">
        <span className="font-display font-bold text-[120px] sm:text-[180px] text-racing-yellow/10 leading-none block">
          404
        </span>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-white uppercase tracking-wider -mt-8 mb-4">
          Page Not Found
        </h1>
        <p className="text-carbon-400 mb-8 max-w-md mx-auto">
          The page you&apos;re looking for seems to have taken a wrong turn on the track.
        </p>
        <Link href="/" className="btn-primary">
          Return to Home
        </Link>
      </div>
    </div>
  );
}
