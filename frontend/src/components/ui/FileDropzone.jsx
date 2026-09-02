import { FileText, ImagePlus, UploadCloud } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

function UploadGridPattern() {
  const columns = 10;
  const rows = 5;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem] opacity-70">
      <div className="grid h-full w-full grid-cols-10 gap-px bg-slate-200/70 p-px">
        {Array.from({ length: columns * rows }).map((_, index) => (
          <div
            key={index}
            className={`rounded-[6px] ${
              index % 3 === 0 ? 'bg-slate-50' : index % 2 === 0 ? 'bg-white' : 'bg-slate-100'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function FileMetaCard({ name, index }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <FileText size={18} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-800">{name}</div>
          <div className="text-xs text-slate-400">فایل {index + 1}</div>
        </div>
      </div>
    </div>
  );
}

export default function FileDropzone({
  accept = '*',
  label = 'فایل را انتخاب کنید',
  helper = 'فایل را بکشید و اینجا رها کنید یا برای انتخاب کلیک کنید.',
  fileName = '',
  fileNames = [],
  preview = '',
  previewList = [],
  image = false,
  multiple = false,
  capture,
  onSelect,
  onSelectMany,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const names = useMemo(() => (fileNames.length ? fileNames : fileName ? [fileName] : []), [fileName, fileNames]);
  const previews = useMemo(() => (previewList.length ? previewList : preview ? [preview] : []), [preview, previewList]);

  const pickFiles = async (files) => {
    if (!files.length) return;
    if (multiple && onSelectMany) {
      await onSelectMany(files);
      return;
    }
    if (onSelect) {
      await onSelect(files[0]);
    }
  };

  const handleChange = async (event) => {
    const files = Array.from(event.target.files || []);
    await pickFiles(files);
    event.target.value = '';
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    await pickFiles(files);
  };

  return (
    <div className="min-w-0 space-y-4">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative block min-w-0 w-full cursor-pointer overflow-hidden rounded-[1.75rem] border border-dashed px-5 py-6 text-right transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 ${
          dragging
            ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-500/10'
            : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          capture={capture}
          className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
          onChange={handleChange}
          multiple={multiple}
          aria-label={label}
        />
        <UploadGridPattern />

        <div className="relative z-10 flex flex-col items-center justify-center text-center">
          <div
            className={`grid h-20 w-20 place-items-center rounded-[1.5rem] border border-slate-200 bg-white shadow-sm transition ${
              dragging ? '-translate-y-1 shadow-lg shadow-indigo-500/15' : ''
            }`}
          >
            {image ? <ImagePlus size={26} className="text-indigo-600" /> : <UploadCloud size={26} className="text-indigo-600" />}
          </div>

          <div className="mt-5 text-base font-black text-slate-800">{label}</div>
          <div className="mt-2 max-w-xl text-sm leading-7 text-slate-500">{helper}</div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700">
            <UploadCloud size={14} />
            <span>{multiple ? 'کشیدن و رها کردن یا انتخاب چند فایل' : 'کشیدن و رها کردن یا انتخاب فایل'}</span>
          </div>
        </div>
      </label>

      {names.length > 0 ? (
        <div className="grid gap-3">
          {names.map((name, index) => (
            <FileMetaCard key={`${name}-${index}`} name={name} index={index} />
          ))}
        </div>
      ) : null}

      {image && previews.length > 0 ? (
        <div className={`grid gap-3 ${multiple ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1'}`}>
          {previews.map((src, index) => (
            <div key={`${src}-${index}`} className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-sm">
              <img src={src} alt={`preview-${index + 1}`} className="h-44 w-full rounded-[1.25rem] bg-white object-contain" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
