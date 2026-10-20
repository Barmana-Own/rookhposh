export default function UserAreaDisabled() {
  return (
    <main dir="rtl" className="grid min-h-[100dvh] place-items-center bg-[#eef2ff] p-6 text-slate-950">
      <section className="card w-full max-w-lg text-center" aria-labelledby="user-area-disabled-title">
        <h1 id="user-area-disabled-title" className="text-2xl font-black">پنل کاربری موقتاً غیرفعال است</h1>
        <p className="mt-4 leading-7">دسترسی به داشبورد و بخش‌های پنل کاربری فعلاً امکان‌پذیر نیست.</p>
      </section>
    </main>
  );
}
