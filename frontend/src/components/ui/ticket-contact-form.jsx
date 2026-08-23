import FileDropzone from './FileDropzone.jsx';
import { Button } from './button.jsx';
import { Card } from './card.jsx';
import { Input } from './input.jsx';
import { Label } from './label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.jsx';
import { Textarea } from './textarea.jsx';

export default function TicketContactForm({
  form,
  attachmentName = '',
  submitting = false,
  onChange,
  onAttachment,
  onSubmit,
}) {
  return (
    <section className="bg-white py-6">
      <div className="mx-auto max-w-3xl px-0">
        <h1 className="text-center text-3xl font-semibold text-slate-950 lg:text-4xl">ثبت تیکت پشتیبانی</h1>
        <p className="mt-4 text-center text-sm leading-7 text-slate-500">موضوع، اولویت، توضیحات و فایل‌های لازم را ارسال کنید تا پشتیبانی دقیق‌تر بررسی کند.</p>

        <Card className="mx-auto mt-10 max-w-lg p-8 shadow-md sm:p-12">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">درخواست شما را به بخش درست می‌رسانیم</h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">توضیح کامل و پیوست مناسب باعث می‌شود پاسخ سریع‌تر و دقیق‌تر دریافت کنید.</p>
          </div>

          <form
            className="mt-10 space-y-6 *:space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit?.();
            }}
          >
            <div>
              <Label htmlFor="ticket-title">موضوع تیکت</Label>
              <Input
                type="text"
                id="ticket-title"
                value={form.title}
                onChange={(event) => onChange('title', event.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="ticket-priority">اولویت</Label>
              <Select value={form.priority} onValueChange={(value) => onChange('priority', value)}>
                <SelectTrigger id="ticket-priority">
                  <SelectValue placeholder="انتخاب اولویت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">کم</SelectItem>
                  <SelectItem value="medium">متوسط</SelectItem>
                  <SelectItem value="high">زیاد</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="ticket-message">متن پیام</Label>
              <Textarea
                id="ticket-message"
                rows={4}
                value={form.message}
                onChange={(event) => onChange('message', event.target.value)}
                required
              />
            </div>

            <FileDropzone
              accept="image/*,.pdf,.zip,.rar,.doc,.docx,.xls,.xlsx,.txt"
              fileName={attachmentName}
              label="پیوست تیکت"
              helper="عکس، PDF، فایل متنی یا فایل‌های رایج را می‌توانید ضمیمه کنید."
              onSelect={onAttachment}
            />

            <Button type="submit" className="w-full rounded-full" disabled={submitting}>
              {submitting ? 'در حال ارسال...' : 'ارسال تیکت'}
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}
