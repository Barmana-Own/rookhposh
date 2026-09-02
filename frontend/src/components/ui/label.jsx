import * as React from 'react';
import { cn } from '../../lib/utils.js';

const Label = React.forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn('text-sm font-medium leading-4 text-slate-800 peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
      {...props}
    />
  );
});

export { Label };
