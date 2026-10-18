import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function SelectMenu({ label, value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const activeIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[activeIndex];

  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const keyDown = event => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setOpen(true);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
  };

  return <div className={`select-menu ${className}`} ref={root} onKeyDown={keyDown}>
    {label && <span className="select-label">{label}</span>}
    <button type="button" className="select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span>{selected?.label}</span><ChevronDown />
    </button>
    {open && <div className="select-options" role="listbox" aria-label={label}>
      {options.map(option => <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        className={option.value === value ? 'selected' : ''}
        key={option.value}
        onClick={() => { onChange(option.value); setOpen(false); }}
      >{option.label}</button>)}
    </div>}
  </div>;
}
