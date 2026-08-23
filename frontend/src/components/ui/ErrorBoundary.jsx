import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="page">
          <div className="card border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            <h1 className="text-xl font-black">خطا در نمایش این بخش</h1>
            <p className="mt-2 text-sm">صفحه با خطای داخلی روبه‌رو شد. مسیر دیگری را باز کنید یا صفحه را دوباره بارگذاری کنید.</p>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
