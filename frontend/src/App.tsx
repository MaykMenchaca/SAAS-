import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-neutral-bg">
          <h1 className="text-2xl font-bold p-8 text-neutral-text-primary">
            POS System
          </h1>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
