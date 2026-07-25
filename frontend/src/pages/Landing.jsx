import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    title: 'Test Builder',
    desc: 'Three-step wizard for configuring multi-section tests with MCQ and coding challenges, each with its own timer and evaluation criteria.',
    image: 'https://picsum.photos/seed/testbuilder/900/600',
  },
  {
    title: 'Question Bank',
    desc: 'Build a reusable library of questions once, then pull them into any future test in one click. No more rebuilding from scratch.',
  },
  {
    title: 'Live Code Execution',
    desc: 'Full Monaco editor with real-time grading against hidden test cases via Judge0. Python, Java, C, C++ with instant feedback.',
    image: 'https://picsum.photos/seed/codeexec/900/600',
  },
  {
    title: 'Real-Time Proctoring',
    desc: 'WebSocket heartbeat monitoring, tab-switch detection, and automatic submission on expiry. No extra hardware required.',
  },
  {
    title: 'Results & Analytics',
    desc: 'Score distributions, percentile rankings, per-question breakdowns, leaderboards, and one-click CSV export in a single dashboard.',
    image: 'https://picsum.photos/seed/analytics/900/600',
  },
];

const GALLERY = [
  { title: 'Aptitude Testing', desc: 'MCQ sections with adjustable difficulty, negative marking controls, and per-section timed delivery that adapts to your test blueprint.', image: 'https://picsum.photos/seed/aptitude/640/800' },
  { title: 'Coding Challenges', desc: 'Multi-language code editor with real-time output, hidden test case validation, similarity detection, and memory-limit enforcement.', image: 'https://picsum.photos/seed/codingchallenge/640/800' },
  { title: 'Auto Evaluation', desc: 'Instant grading engine with statistical normalization, percentile curves, and granular section-by-section performance breakdowns.', image: 'https://picsum.photos/seed/evaluation/640/800' },
  { title: 'Bulk Operations', desc: 'Upload entire question banks via CSV, invite cohorts with a single link, and export comprehensive results in one click.', image: 'https://picsum.photos/seed/bulkops/640/800' },
];

const TESTIMONIALS = [
  { name: 'Dr. Ananya Sharma', role: 'T&P Officer, IIT Hyderabad', quote: 'Cut our placement process from two weeks to under 48 hours. The auto-evaluation engine alone saved hundreds of faculty hours.', image: 'https://picsum.photos/seed/ananya/200/200' },
  { name: 'Prof. Ravi Menon', role: 'Dean Academics, VIT Chennai', quote: 'Ran a 900-student test simultaneously without a single dropout. The proctoring system flagged six tab-switch attempts in real time.', image: 'https://picsum.photos/seed/ravimenon/200/200' },
  { name: 'Neha Gupta', role: 'Campus Lead, NIT Trichy', quote: 'Students love the Monaco editor. It mirrors real coding interviews perfectly and the instant feedback keeps them engaged.', image: 'https://picsum.photos/seed/nehagupta/200/200' },
];

const PARTNERS = ['AWS', 'Docker', 'MongoDB', 'PostgreSQL', 'Redis', 'Kubernetes', 'TensorFlow', 'PyTorch', 'Node.js', 'React', 'TypeScript', 'Go', 'GraphQL', 'Kafka'];

const BENTO_SPANS = [
  'col-span-3 lg:col-span-2 row-span-1',
  'col-span-3 lg:col-span-1 row-span-1',
  'col-span-3 lg:col-span-1 row-span-1',
  'col-span-3 lg:col-span-2 row-span-1',
  'col-span-3 lg:col-span-3 row-span-1',
];

// Reuses the site's semantic tokens (accent/clarify/verify/alert) instead of
// arbitrary Tailwind swatches, so the feature grid reads as part of the same
// design system as the rest of the app.
const BENTO_COLORS = [
  { dot: 'bg-accent', border: 'border-accent/25', gradient: 'from-accent/10 to-accent-light/5' },
  { dot: 'bg-clarify', border: 'border-clarify/25', gradient: 'from-clarify/10 to-clarify-light/5' },
  { dot: 'bg-verify', border: 'border-verify/25', gradient: 'from-verify/10 to-verify-light/5' },
  { dot: 'bg-alert', border: 'border-alert/25', gradient: 'from-alert/10 to-alert-light/5' },
  { dot: 'bg-accent-dark', border: 'border-accent/25', gradient: 'from-accent/10 to-clarify/5' },
];

function GlowOrb({ color, size = 600, top, left, bottom, right, opacity = 0.14 }) {
  // Soft, low-opacity color wash — multiply blend so it reads as a warm
  // tint against the site's cream background instead of a dark-mode glow.
  return (
    <div
      className="absolute pointer-events-none will-change-transform"
      style={{
        width: size, height: size,
        top, left, bottom, right,
        background: `radial-gradient(ellipse at center, ${color} ${opacity * 100}%, transparent 70%)`,
        mixBlendMode: 'multiply',
        transform: 'translateZ(0)',
      }}
    />
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 40);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 will-change-transform ${scrolled ? 'bg-panel/85 backdrop-blur-xl border-b border-rim' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-16">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-raised transition-transform duration-500 group-hover:scale-110">
              <svg className="w-5 h-5 text-panel" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
            </div>
            <span className="font-display font-bold text-lg text-ink tracking-tight">CampusTrack</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-annotation hover:text-ink transition-colors duration-300">Features</a>
            <a href="#capabilities" className="text-sm text-annotation hover:text-ink transition-colors duration-300">Capabilities</a>
            <a href="#testimonials" className="text-sm text-annotation hover:text-ink transition-colors duration-300">Testimonials</a>
            <Link to="/login" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-panel text-sm font-semibold hover:bg-accent-dark transition-all duration-300 hover:shadow-raised">
              Sign In
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-deck via-panel to-deck" />
      <GlowOrb color="rgba(47, 93, 86, 0.5)" size={700} top="-10%" left="-10%" opacity={0.16} />
      <GlowOrb color="rgba(86, 92, 134, 0.4)" size={500} bottom="-15%" right="0" opacity={0.12} />
      <div className="absolute inset-0" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '256px 256px', opacity: 0.03, pointerEvents: 'none' }} />

      <div className="relative w-full max-w-7xl mx-auto px-6 lg:px-16 py-32 lg:py-40">
        <div className="max-w-2xl xl:max-w-3xl relative z-10">
          <h1 className="font-display font-black text-[clamp(2.8rem,6vw,5rem)] leading-[1.06] tracking-tight text-ink max-w-5xl">
            We craft digital environments for{' '}
            <span className="inline-block w-[1.2em] h-[1em] rounded-full align-middle bg-cover bg-center mx-2 opacity-90 shadow-raised will-change-transform" style={{ backgroundImage: 'url(https://picsum.photos/seed/placement/200/200)' }} />
            {' '}placement excellence
          </h1>
          <p className="text-base lg:text-lg text-annotation max-w-xl mt-6 leading-relaxed">
            Aptitude tests, live coding challenges, Google OAuth integration, and real-time proctoring — replacing HackerRank, Google Forms, and spreadsheets with one self-hosted system built to handle a thousand students at once.
          </p>
          <div className="flex flex-wrap gap-4 mt-10">
            <Link to="/login" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-accent text-panel text-sm font-bold hover:bg-accent-dark transition-all duration-300 hover:shadow-raised">
              Get Started
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-rim text-ink text-sm font-semibold hover:bg-panel transition-all duration-300">
              Explore Features
            </a>
          </div>
        </div>

        <div className="absolute right-0 bottom-0 w-[55%] lg:w-[48%] pointer-events-none">
          <div className="relative aspect-[4/3] translate-x-12 lg:translate-x-16 translate-y-12 lg:translate-y-16 rotate-3 lg:rotate-6 rounded-2xl overflow-hidden shadow-modal will-change-transform">
            <img src="https://picsum.photos/seed/dashboard/1200/900" alt="" className="w-full h-full object-cover grayscale contrast-125 opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-tl from-ink/50 via-ink/5 to-transparent mix-blend-multiply" />
            <div className="absolute inset-0 ring-1 ring-rim rounded-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

function BentoFeatures() {
  const sectionRef = useRef(null);

  useGSAP(() => {
    const cards = sectionRef.current.querySelectorAll('.bento-card');
    cards.forEach((card, i) => {
      gsap.fromTo(card, { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, delay: i * 0.1, ease: 'power2.out',
        scrollTrigger: { trigger: card, start: 'top bottom-=60', toggleActions: 'play none none none' },
      });
    });
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} id="features" className="relative py-32 lg:py-48 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-deck via-panel to-deck" />
      <GlowOrb color="rgba(47, 93, 86, 0.4)" size={900} top="50%" left="50%" opacity={0.1} />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-16">
        <div className="max-w-2xl mb-16 lg:mb-20">
          <p className="font-display text-xs font-semibold tracking-[0.2em] uppercase text-accent mb-4">Platform Capabilities</p>
          <h2 className="font-display font-bold text-3xl lg:text-5xl text-ink leading-[1.1] tracking-tight">
            Everything you need to run placements at scale
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-4 lg:gap-5 grid-flow-dense">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`group relative ${BENTO_SPANS[i]} bento-card will-change-transform`}>
              <div className={`relative h-full rounded-2xl border ${BENTO_COLORS[i].border} bg-gradient-to-br ${BENTO_COLORS[i].gradient} bg-panel overflow-hidden transition-all duration-500 hover:scale-[1.02]`}>
                {f.image && (
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500">
                    <img src={f.image} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/40 to-transparent" />
                  </div>
                )}
                <div className="relative p-6 lg:p-8 h-full flex flex-col justify-end">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${BENTO_COLORS[i].border} bg-deck/60`}>
                    <div className={`w-2 h-2 rounded-full ${BENTO_COLORS[i].dot}`} />
                  </div>
                  <h3 className="font-display font-bold text-lg text-ink mb-2">{f.title}</h3>
                  <p className="text-sm text-annotation leading-relaxed max-w-md">{f.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GSSplitSection() {
  const sectionRef = useRef(null);
  const titleRef = useRef(null);

  useGSAP(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top 80px',
        end: 'bottom top',
        pin: titleRef.current,
        pinSpacing: true,
        anticipatePin: 1,
      });

      const items = sectionRef.current.querySelectorAll('.gallery-item');
      items.forEach((item) => {
        gsap.fromTo(item, { y: 60, opacity: 0.3 }, {
          y: 0, opacity: 1, duration: 1.2, ease: 'power2.out',
          scrollTrigger: {
            trigger: item,
            start: 'top bottom-=80',
            end: 'top center',
            scrub: 0.6,
          },
        });
      });
    }, sectionRef);

    return () => ctx.revert();
  });

  return (
    <section ref={sectionRef} id="capabilities" className="relative py-32 lg:py-48 overflow-hidden">
      <div className="absolute inset-0 bg-deck" />
      <GlowOrb color="rgba(86, 92, 134, 0.4)" size={500} right="-10%" top="20%" opacity={0.12} />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-16">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
          <div ref={titleRef} className="lg:col-span-4 self-start">
            <p className="font-display text-xs font-semibold tracking-[0.2em] uppercase text-clarify mb-4">Deep Capabilities</p>
            <h2 className="font-display font-bold text-3xl lg:text-5xl text-ink leading-[1.1] tracking-tight">
              Purpose-built for campus recruitment
            </h2>
            <p className="text-annotation mt-6 leading-relaxed max-w-sm">
              Every feature is engineered to handle the scale, security, and flexibility demands of college placement drives — from first-year internships to final-year campus hiring.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-7 space-y-24 lg:space-y-32">
            {GALLERY.map((item) => (
              <div key={item.title} className="gallery-item will-change-transform">
                <div className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-6 shadow-modal">
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover grayscale contrast-125 opacity-90 transition-transform duration-700 hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/50 via-ink/5 to-transparent" />
                  <div className="absolute inset-0 ring-1 ring-rim rounded-2xl" />
                </div>
                <h3 className="font-display font-bold text-xl text-ink mb-2">{item.title}</h3>
                <p className="text-annotation leading-relaxed max-w-lg">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CardStackSection() {
  const sectionRef = useRef(null);

  useGSAP(() => {
    const cards = sectionRef.current.querySelectorAll('.stack-card');
    cards.forEach((card, i) => {
      gsap.fromTo(card, { y: 80, opacity: 0.3 }, {
        y: 0, opacity: 1, duration: 0.8, delay: i * 0.15, ease: 'power2.out',
        scrollTrigger: {
          trigger: card,
          start: 'top bottom-=40',
          toggleActions: 'play none none none',
        },
      });
    });
  }, { scope: sectionRef });

  const stackItems = [
    { number: '01', title: 'Create Tests', desc: 'Build multi-section tests with MCQ and coding sections in a three-step wizard. Set per-section timers, pass criteria, and difficulty levels.' },
    { number: '02', title: 'Invite Students', desc: 'Generate unique test links or bulk-import cohorts via CSV. Students authenticate with Google OAuth — no manual account creation needed.' },
    { number: '03', title: 'Monitor Live', desc: 'Watch real-time progress with WebSocket heartbeats. See who is active, who switched tabs, and who submitted — all on one dashboard.' },
    { number: '04', title: 'Evaluate & Export', desc: 'Instant auto-grading with statistical curves. Export comprehensive reports with one click. Resume crashed tests without losing data.' },
  ];

  return (
    <section ref={sectionRef} className="relative py-32 lg:py-48 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-deck via-panel to-deck" />
      <GlowOrb color="rgba(47, 93, 86, 0.4)" size={600} left="20%" top="30%" opacity={0.1} />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-16">
        <div className="max-w-2xl mb-20">
          <p className="font-display text-xs font-semibold tracking-[0.2em] uppercase text-accent mb-4">Workflow</p>
          <h2 className="font-display font-bold text-3xl lg:text-5xl text-ink leading-[1.1] tracking-tight">
            From creation to results in four steps
          </h2>
        </div>

        <div className="grid lg:grid-cols-4 gap-4 lg:gap-6">
          {stackItems.map((item) => (
            <div key={item.number} className="stack-card relative group will-change-transform">
              <div className="relative rounded-2xl border border-rim bg-panel/80 backdrop-blur-sm p-8 h-full transition-all duration-500 hover:bg-panel hover:border-accent/25">
                <span className="font-display font-black text-5xl lg:text-6xl text-ink/[0.06] absolute top-4 right-6 leading-none select-none">{item.number}</span>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent-light/10 border border-accent/20 flex items-center justify-center mb-6">
                    <span className="font-display font-bold text-lg text-accent">{item.number}</span>
                  </div>
                  <h3 className="font-display font-bold text-xl text-ink mb-3">{item.title}</h3>
                  <p className="text-sm text-annotation leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarqueeSection() {
  const marqueeRef = useRef(null);

  useGSAP(() => {
    const ctx = gsap.context(() => {
      gsap.to(marqueeRef.current, {
        xPercent: -50,
        duration: 40,
        ease: 'none',
        repeat: -1,
      });
    }, marqueeRef);
    return () => ctx.revert();
  });

  return (
    <section className="relative py-24 lg:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-deck" />
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 mb-12">
          <p className="font-display text-xs font-semibold tracking-[0.2em] uppercase text-annotation/70 text-center">Trusted by institutions running on modern infrastructure</p>
        </div>
        <div className="overflow-hidden border-y border-rim py-8">
          <div ref={marqueeRef} className="flex gap-16 items-center will-change-transform" style={{ width: 'fit-content' }}>
            {[...PARTNERS, ...PARTNERS].map((name, i) => (
              <span key={`${name}-${i}`} className="font-display font-bold text-lg lg:text-xl text-ink/[0.15] hover:text-ink/40 transition-colors duration-500 whitespace-nowrap tracking-tight select-none">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const [active, setActive] = useState(0);
  const quoteRef = useRef(null);
  const timelineRef = useRef(null);

  const animateQuote = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
    }
    const tl = gsap.timeline();
    tl.fromTo(quoteRef.current, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' });
    timelineRef.current = tl;
  }, []);

  useEffect(() => {
    animateQuote();
  }, [active, animateQuote]);

  const prev = () => setActive((a) => (a - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  const next = () => setActive((a) => (a + 1) % TESTIMONIALS.length);

  return (
    <section id="testimonials" className="relative py-32 lg:py-48 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-deck via-panel to-deck" />
      <GlowOrb color="rgba(86, 92, 134, 0.4)" size={500} bottom="20%" right="30%" opacity={0.1} />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-16">
        <div className="max-w-2xl mb-16 lg:mb-20">
          <p className="font-display text-xs font-semibold tracking-[0.2em] uppercase text-clarify mb-4">Testimonials</p>
          <h2 className="font-display font-bold text-3xl lg:text-5xl text-ink leading-[1.1] tracking-tight">
            Trusted by placement cells across India
          </h2>
        </div>

        <div className="grid lg:grid-cols-5 gap-12 lg:gap-20 items-center">
          <div className="lg:col-span-2">
            <div className="flex -space-x-4 mb-8">
              {TESTIMONIALS.map((t, i) => (
                <div key={t.name} className={`relative w-16 h-16 rounded-full overflow-hidden ring-2 ring-deck transition-all duration-500 cursor-pointer ${i === active ? 'ring-accent scale-110 z-10' : 'ring-rim hover:z-10'}`}
                  onClick={() => setActive(i)}>
                  <img src={t.image} alt={t.name} className="w-full h-full object-cover grayscale contrast-125" />
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div ref={quoteRef} className="space-y-6">
              <svg className="w-8 h-8 text-accent/25" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151C7.563 6.068 6 8.789 6 11h4v10H0z" />
              </svg>
              <blockquote className="font-display text-xl lg:text-2xl text-ink leading-relaxed font-medium">
                {TESTIMONIALS[active].quote}
              </blockquote>
              <div>
                <p className="font-display font-bold text-ink">{TESTIMONIALS[active].name}</p>
                <p className="text-sm text-annotation mt-0.5">{TESTIMONIALS[active].role}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-12">
          <button onClick={prev} className="w-11 h-11 rounded-xl border border-rim flex items-center justify-center text-ink hover:bg-panel transition-all duration-300 group">
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={next} className="w-11 h-11 rounded-xl border border-rim flex items-center justify-center text-ink hover:bg-panel transition-all duration-300 group">
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="relative py-32 lg:py-48 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-panel via-deck to-panel" />
      <GlowOrb color="rgba(47, 93, 86, 0.4)" size={800} top="50%" left="50%" opacity={0.12} />

      <div className="relative max-w-4xl mx-auto px-6 lg:px-16 text-center">
        <h2 className="font-display font-black text-4xl lg:text-6xl text-ink leading-[1.06] tracking-tight max-w-4xl mx-auto">
          Ready to run your next placement drive?
        </h2>
        <p className="text-lg text-annotation max-w-2xl mx-auto mt-6 leading-relaxed">
          Sign in with your college account to get started. Students can access their tests immediately, and T&P cells get full administrative controls.
        </p>
        <div className="flex flex-wrap justify-center gap-4 mt-10">
          <Link to="/login" className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-accent text-panel text-base font-bold hover:bg-accent-dark transition-all duration-300 hover:shadow-raised hover:scale-[1.02]">
            Get Started Free
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <a href="#" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-rim text-ink text-base font-semibold hover:bg-panel transition-all duration-300">
            Watch Overview
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-rim py-16">
      <div className="absolute inset-0 bg-panel" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-16">
        <div className="grid lg:grid-cols-4 gap-10">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center">
                <svg className="w-4 h-4 text-panel" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <span className="font-display font-bold text-lg text-ink">CampusTrack</span>
            </div>
            <p className="text-sm text-annotation max-w-sm leading-relaxed">
              Open-source placement assessment platform built for engineering colleges. Self-hosted, secure, and designed for scale.
            </p>
          </div>
          <div>
            <p className="font-display font-semibold text-sm text-ink mb-4">Platform</p>
            <div className="space-y-3">
              <a href="#features" className="block text-sm text-annotation hover:text-ink transition-colors duration-300">Features</a>
              <a href="#capabilities" className="block text-sm text-annotation hover:text-ink transition-colors duration-300">Capabilities</a>
              <a href="#" className="block text-sm text-annotation hover:text-ink transition-colors duration-300">Pricing</a>
              <a href="#" className="block text-sm text-annotation hover:text-ink transition-colors duration-300">Documentation</a>
            </div>
          </div>
          <div>
            <p className="font-display font-semibold text-sm text-ink mb-4">Connect</p>
            <div className="space-y-3">
              <a href="#" className="block text-sm text-annotation hover:text-ink transition-colors duration-300">GitHub</a>
              <a href="#" className="block text-sm text-annotation hover:text-ink transition-colors duration-300">Documentation</a>
              <a href="#" className="block text-sm text-annotation hover:text-ink transition-colors duration-300">Support</a>
              <Link to="/login" className="block text-sm text-accent hover:text-accent-dark transition-colors duration-300 font-medium">Sign In</Link>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-rim text-center">
          <p className="text-xs text-annotation/70">&copy; {new Date().getFullYear()} CampusTrack. All rights reserved. Open-source under MIT.</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#F3EFE2';
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  return (
    <main className="overflow-x-hidden w-full max-w-full min-h-screen bg-deck text-ink">
      <Nav />
      <Hero />
      <BentoFeatures />
      <GSSplitSection />
      <CardStackSection />
      <MarqueeSection />
      <TestimonialsSection />
      <CTA />
      <Footer />
    </main>
  );
}
