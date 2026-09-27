import { Component } from "react";

// Must be a class component — there is still no hook equivalent for
// getDerivedStateFromError/componentDidCatch, so this is the one place in
// the app a class is the right tool rather than a function component.
//
// No third-party error-reporting service is wired up here: the error is
// logged to the console only, per the brief. If that ever changes, this is
// the one place to add the call — every route already funnels through it
// (see App.jsx).
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Unhandled error caught by ErrorBoundary:", error, errorInfo.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
          <p className="text-sm text-gray-500">
            This page ran into a problem. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
