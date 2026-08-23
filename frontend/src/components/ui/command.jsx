import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { cn } from '../../lib/utils.js';

const Command = React.forwardRef(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn('flex h-full w-full flex-col overflow-hidden rounded-[24px] bg-white text-slate-900', className)}
      {...props}
    />
  );
});

const CommandInput = React.forwardRef(function CommandInput({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-2xl bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

const CommandList = React.forwardRef(function CommandList({ className, ...props }, ref) {
  return <CommandPrimitive.List ref={ref} className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)} {...props} />;
});

const CommandEmpty = React.forwardRef(function CommandEmpty(props, ref) {
  return <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm text-slate-500" {...props} />;
});

const CommandGroup = React.forwardRef(function CommandGroup({ className, ...props }, ref) {
  return <CommandPrimitive.Group ref={ref} className={cn('overflow-hidden p-1 text-slate-900', className)} {...props} />;
});

const CommandItem = React.forwardRef(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-2xl px-3 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-slate-100 data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };
