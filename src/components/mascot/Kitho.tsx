import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  type CSSProperties,
} from 'react';
import {
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceNumber,
  useViewModelInstanceTrigger,
} from '@rive-app/react-webgl2';
import { cn } from '../../lib/cn';

/** The four resting moods baked into the Kitho state machine. */
export const KITHO_MOODS = ['idle', 'happy', 'thinking', 'sleeping'] as const;
export type KithoMood = (typeof KITHO_MOODS)[number];

/** One-shot actions overlaid on top of whichever mood is resting. */
export const KITHO_ACTIONS = ['wave', 'celebrate', 'surprise', 'encourage'] as const;
export type KithoAction = (typeof KITHO_ACTIONS)[number];

const MOOD_VALUES: Record<KithoMood, number> = {
  idle: 0,
  happy: 1,
  thinking: 2,
  sleeping: 3,
};

export const KITHO_MOOD_LABELS: Record<KithoMood, string> = {
  idle: 'Idle',
  happy: 'Happy',
  thinking: 'Thinking',
  sleeping: 'Sleeping',
};

export const KITHO_ACTION_LABELS: Record<KithoAction, string> = {
  wave: 'Wave',
  celebrate: 'Celebrate',
  surprise: 'Surprised',
  encourage: 'Encourage',
};

const RIV_SRC = '/mascot/kitho/kitho.riv';
const FALLBACK_SRC = '/mascot/kitho/kitho-idle.png';
const ARTBOARD = 'Kitho';
const STATE_MACHINE = 'Kitho';

export interface KithoHandle {
  /** Fire a one-shot action without changing the resting mood. */
  play: (action: KithoAction) => void;
}

export interface KithoProps {
  /** Resting mood the character settles into. */
  mood?: KithoMood;
  /** Square size in pixels. Defaults to 320. */
  size?: number;
  className?: string;
  /** Screen-reader description. */
  label?: string;
  /** Render the static idle image instead of loading the Rive runtime. */
  staticFallback?: boolean;
  /** Called once the .riv has loaded and the state machine is live. */
  onReady?: () => void;
  /** Called when the .riv fails to load; the static image stays visible. */
  onError?: () => void;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

type KithoRiveProps = {
  mood: KithoMood;
  onReady?: () => void;
  onError?: () => void;
};

const KithoRive = forwardRef<KithoHandle, KithoRiveProps>(function KithoRive(
  { mood, onReady, onError },
  ref,
) {
  const [ready, setReady] = useState(false);

  const { rive, RiveComponent } = useRive(
    {
      src: RIV_SRC,
      artboard: ARTBOARD,
      stateMachine: STATE_MACHINE,
      autoplay: true,
      autoBind: true,
      onLoad: () => {
        setReady(true);
        onReady?.();
      },
      onLoadError: () => onError?.(),
    },
    { shouldResizeCanvasToContainer: true },
  );

  const viewModel = useViewModel(rive, { useDefault: true });
  const instance = useViewModelInstance(viewModel, { useDefault: true, rive });
  const moodValue = useViewModelInstanceNumber('mood', instance);
  const wave = useViewModelInstanceTrigger('wave', instance);
  const celebrate = useViewModelInstanceTrigger('celebrate', instance);
  const surprise = useViewModelInstanceTrigger('surprise', instance);
  const encourage = useViewModelInstanceTrigger('encourage', instance);

  useEffect(() => {
    if (!ready) return;
    moodValue.setValue(MOOD_VALUES[mood]);
  }, [mood, ready, moodValue.setValue]);

  const play = useCallback(
    (action: KithoAction) => {
      if (!ready) return;
      switch (action) {
        case 'wave':
          wave.trigger();
          break;
        case 'celebrate':
          celebrate.trigger();
          break;
        case 'surprise':
          surprise.trigger();
          break;
        case 'encourage':
          encourage.trigger();
          break;
      }
    },
    [ready, wave.trigger, celebrate.trigger, surprise.trigger, encourage.trigger],
  );

  useImperativeHandle(ref, () => ({ play }), [play]);

  return (
    <div
      className={cn(
        'absolute inset-0 transition-opacity duration-300',
        ready ? 'opacity-100' : 'opacity-0',
      )}
    >
      <RiveComponent className="h-full w-full" aria-hidden="true" />
    </div>
  );
});

/**
 * Kitho, the Kith mascot. Loads `public/mascot/kitho/kitho.riv`, binds its
 * `KithoVM` view model and drives the `Kitho` state machine.
 *
 * Falls back to a static idle frame while loading, on load failure, or when
 * the visitor prefers reduced motion.
 */
const Kitho = forwardRef<KithoHandle, KithoProps>(function Kitho(
  {
    mood = 'idle',
    size = 320,
    className,
    label = `Kitho, the Kith mascot, ${KITHO_MOOD_LABELS[mood].toLowerCase()}`,
    staticFallback = false,
    onReady,
    onError,
  },
  ref,
) {
  const reducedMotion = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const showStatic = staticFallback || reducedMotion || failed;
  const style: CSSProperties = { width: size, height: size };

  return (
    <div
      role="img"
      aria-label={label}
      className={cn('relative shrink-0', className)}
      style={style}
    >
      <img
        src={FALLBACK_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn(
          'absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-300',
          ready && !showStatic ? 'opacity-0' : 'opacity-100',
        )}
      />
      {!showStatic && (
        <KithoRive
          ref={ref}
          mood={mood}
          onReady={() => {
            setReady(true);
            onReady?.();
          }}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      )}
    </div>
  );
});

export default Kitho;
