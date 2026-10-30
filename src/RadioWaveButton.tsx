import { useId, useState, type ButtonHTMLAttributes } from 'react';

type RadioWaveButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * An iridescent liquid-film pulse. SVG gradients create pearlescent bands;
 * a subtle static displacement makes their edges look like oil on water.
 * Animation is decorative and never interferes with the button action.
 */
export default function RadioWaveButton({
  children, className = '', onClick, ...rest
}: RadioWaveButtonProps) {
  const [burst, setBurst] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '_');
  const spectral = uid + '-spectral';
  const ripple = uid + '-ripple';

  return (
    <button
      {...rest}
      className={(className + ' radio-wave-button').trim()}
      onClick={event => {
        setBurst(previous => previous + 1);
        onClick?.(event);
      }}
    >
      <span className="radio-wave-label">{children}</span>
      {burst > 0 && (
        <span
          key={burst}
          className="radio-wave-emission"
          aria-hidden="true"
          onAnimationEnd={event => {
            if (event.target === event.currentTarget && event.animationName === 'radio-wave-cleanup') {
              setBurst(previous => previous === burst ? 0 : previous);
            }
          }}
        >
          <svg className="oil-slick-svg" viewBox="0 0 260 150" focusable="false" aria-hidden="true">
            <defs>
              <radialGradient id={spectral} cx="50%" cy="50%" r="51%">
                <stop offset="0%" stopColor="#9d8acb" stopOpacity="0" />
                <stop offset="64%" stopColor="#9d8acb" stopOpacity="0" />
                <stop offset="67%" stopColor="#a58dd7" stopOpacity=".10" />
                <stop offset="69%" stopColor="#927cc9" stopOpacity=".27" />
                <stop offset="71%" stopColor="#719cce" stopOpacity=".37" />
                <stop offset="73%" stopColor="#68c8d2" stopOpacity=".39" />
                <stop offset="75%" stopColor="#a0d0aa" stopOpacity=".39" />
                <stop offset="77%" stopColor="#dfd39a" stopOpacity=".40" />
                <stop offset="79%" stopColor="#dfa48d" stopOpacity=".35" />
                <stop offset="81%" stopColor="#c393bc" stopOpacity=".28" />
                <stop offset="84%" stopColor="#8c9cce" stopOpacity=".11" />
                <stop offset="88%" stopColor="#8c9cce" stopOpacity="0" />
                <stop offset="100%" stopColor="#8c9cce" stopOpacity="0" />
              </radialGradient>
              <filter id={ripple} x="-12%" y="-20%" width="124%" height="140%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency=".014 .034" numOctaves="2" seed="9" result="liquidNoise" />
                <feDisplacementMap in="SourceGraphic" in2="liquidNoise" scale="7" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            <g filter={'url(#' + ripple + ')'}>
              <ellipse cx="130" cy="75" rx="126" ry="70" fill={'url(#' + spectral + ')'} />
            </g>
          </svg>
        </span>
      )}
    </button>
  );
}
