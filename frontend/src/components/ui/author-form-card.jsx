import * as React from 'react';
import { motion } from 'framer-motion';
import { Camera, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Button } from './button.jsx';
import { Input } from './input.jsx';
import { Label } from './label.jsx';
import { Avatar, AvatarFallback, AvatarImage } from './avatar.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip.jsx';

export function AuthorFormCard({
  initialData,
  onSubmit,
  onCancel,
  onImageSelect,
  saving = false,
  className,
  heading = 'اطلاعات کاربری',
  nameLabel = 'نام و نام خانوادگی',
  namePlaceholder = 'مثلا آرش کریمی',
  titleLabel = 'ایمیل',
  titlePlaceholder = 'example@gmail.com',
  titleHelp = 'ایمیل حساب کاربری شما از اینجا قابل ویرایش است.',
}) {
  const [name, setName] = React.useState(initialData?.name || '');
  const [title, setTitle] = React.useState(initialData?.title || '');
  const [imageUrl, setImageUrl] = React.useState(initialData?.imageUrl);
  const fileInputRef = React.useRef(null);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit?.({ name, title, imageUrl });
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const nextUrl = await onImageSelect?.(file);
    if (nextUrl) setImageUrl(nextUrl);
  };

  const fadeIn = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' } },
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.15 } } }}
      className={cn('relative w-full rounded-[28px] bg-white p-6 shadow-xl ring-1 ring-slate-200', className)}
    >
      <div className="flex items-center justify-between">
        <motion.h3 variants={fadeIn} className="text-xl font-semibold text-slate-900">
          {heading}
        </motion.h3>
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="بستن">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3">
        <motion.div variants={fadeIn} className="flex flex-col items-center gap-3 md:col-span-1">
          <div className="relative">
            <Avatar className="h-24 w-24 border-2 border-dashed border-slate-200">
              <AvatarImage src={imageUrl} alt={name || 'User'} />
              <AvatarFallback className="bg-slate-100">
                <span className="text-xs text-slate-500">تصویر</span>
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white transition-colors hover:bg-slate-50"
              aria-label="آپلود تصویر"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 text-slate-500" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-900">تصویر پروفایل</p>
            <p className="text-xs text-slate-500">حداکثر حجم مناسب: 1MB</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
            انتخاب تصویر
          </Button>
        </motion.div>

        <div className="flex flex-col gap-4 md:col-span-2">
          <motion.div variants={fadeIn} className="grid w-full items-center gap-1.5">
            <Label htmlFor="profile-name">
              {nameLabel} <span className="text-rose-500">*</span>
            </Label>
            <Input
              type="text"
              id="profile-name"
              placeholder={namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </motion.div>

          <motion.div variants={fadeIn} className="grid w-full items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="profile-title">{titleLabel}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 cursor-pointer text-slate-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{titleHelp}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="text"
              id="profile-title"
              placeholder={titlePlaceholder}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </motion.div>
        </div>

        <motion.div variants={fadeIn} className="flex justify-end gap-3 md:col-span-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            انصراف
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
          </Button>
        </motion.div>
      </form>
    </motion.div>
  );
}
