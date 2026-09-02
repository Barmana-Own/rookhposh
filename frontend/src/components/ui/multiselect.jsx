import { CheckIcon, Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command.jsx';
import { cn } from '../../lib/utils.js';

export default function MultipleSelector({
  value = [],
  options = [],
  onChange,
  placeholder = 'Select options',
  emptyIndicator = null,
  hideClearAllButton = false,
  hidePlaceholderWhenSelected = false,
  creatable = false,
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedValues = useMemo(() => new Set(value.map((item) => item.value)), [value]);

  const filteredOptions = useMemo(() => {
    const normalized = inputValue.trim().toLowerCase();
    return options.filter((option) => {
      if (selectedValues.has(option.value)) return false;
      if (!normalized) return true;
      return option.label.toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized);
    });
  }, [inputValue, options, selectedValues]);

  const canCreate =
    creatable &&
    inputValue.trim() &&
    !options.some((item) => item.value === inputValue.trim()) &&
    !selectedValues.has(inputValue.trim());

  const removeValue = (itemValue) => {
    onChange?.(value.filter((item) => item.value !== itemValue));
  };

  const addValue = (option) => {
    onChange?.([...value, option]);
    setInputValue('');
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div
        className={cn(
          'min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition',
          open && 'border-slate-400',
        )}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {value.map((item) => (
            <span
              key={item.value}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {item.label}
              <button
                type="button"
                className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  removeValue(item.value);
                }}
              >
                <Cross2Icon className="h-3 w-3" />
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={hidePlaceholderWhenSelected && value.length ? '' : placeholder}
            className="h-8 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />

          {!hideClearAllButton && value.length ? (
            <button
              type="button"
              className="mr-auto rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={(event) => {
                event.stopPropagation();
                onChange?.([]);
              }}
            >
              <Cross2Icon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
          <Command className="bg-white">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
              <MagnifyingGlassIcon className="h-4 w-4 text-slate-400" />
              <CommandInput ref={inputRef} value={inputValue} onValueChange={setInputValue} placeholder={placeholder} className="border-0 px-0" />
            </div>
            <CommandList className="mt-2 max-h-56">
              <CommandEmpty>{emptyIndicator || 'موردی پیدا نشد.'}</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => addValue(option)}
                    className="flex items-center justify-between"
                  >
                    <span>{option.label}</span>
                    <CheckIcon className="h-4 w-4 opacity-0" />
                  </CommandItem>
                ))}
                {canCreate ? (
                  <CommandItem
                    value={inputValue.trim()}
                    onSelect={() => addValue({ value: inputValue.trim(), label: inputValue.trim() })}
                    className="flex items-center justify-between"
                  >
                    <span>افزودن "{inputValue.trim()}"</span>
                    <CheckIcon className="h-4 w-4 text-slate-400" />
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
