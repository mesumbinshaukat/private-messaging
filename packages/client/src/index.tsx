/**
 * Entry point for the admin dashboard
 * Ensures authentication and role checks
 */
import AdminLayout from '@/app/(admin)/layout';

// Client entry for admin dashboard
document.addEventListener('DOMContentLoaded', () => {
  import('react-dom').then((ReactDOM) => {
    import('react').then((React) => {
      import('@tanstack/react-query').then(({ QueryClient, QueryClientProvider }) => {
        const queryClient = new QueryClient();

        ReactDOM.render(
          QueryClientProvider client={queryClient}
            AdminLayout/AdminLayoutlayout
          Query 
