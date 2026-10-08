export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-[rgba(251,251,253,0.8)] backdrop-blur-xl backdrop-saturate-[1.8]">
      <div className="flex h-[52px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[21px] font-semibold tracking-[-0.021em] text-foreground">
            HappyOyster
          </h1>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">
            Direct and explore worlds
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground">
          Powered by Reactor
        </span>
      </div>
    </header>
  );
}
