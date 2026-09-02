import * as React from 'react';
import { cn } from '../../lib/utils.js';

const Input = React.forwardRef(function Input({ className, type, ...props }, ref) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm shadow-black/5 transition-shadow placeholder:text-slate-400 focus-visible:border-indigo-300 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-50',
        type === 'search' &&
          '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none',
        type === 'file' &&
          'p-0 pr-3 italic text-slate-400 file:me-3 file:h-full file:border-0 file:border-r file:border-solid file:border-slate-200 file:bg-transparent file:px-3 file:text-sm file:font-medium file:not-italic file:text-slate-800',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

export { Input };
