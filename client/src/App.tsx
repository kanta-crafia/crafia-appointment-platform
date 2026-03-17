import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import DashboardLayout from "./components/DashboardLayout";
import Login from "./pages/Login";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import Organizations from "./pages/admin/Organizations";
import Projects from "./pages/admin/Projects";
import Allocations from "./pages/admin/Allocations";
import Approvals from "./pages/admin/Approvals";
import AuditLogs from "./pages/admin/AuditLogs";
import AgencyStats from "./pages/admin/AgencyStats";
import SnsAccounts from "./pages/admin/SnsAccounts";
import SubAllocationPrices from "./pages/admin/SubAllocationPrices";
// Partner pages
import PartnerDashboard from "./pages/partner/PartnerDashboard";
import MyAllocations from "./pages/partner/MyAllocations";
import NewAppointment from "./pages/partner/NewAppointment";
import PartnerAppointments from "./pages/partner/Appointments";
import SubPartnerManagement from "./pages/partner/SubPartnerManagement";

// Shared pages
import Notifications from "./pages/Notifications";

function AuthenticatedRoutes() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return (
      <DashboardLayout>
        <Switch>
          <Route path="/" component={AdminDashboard} />
          <Route path="/organizations" component={Organizations} />
          <Route path="/projects" component={Projects} />
          <Route path="/allocations" component={Allocations} />
          <Route path="/approvals" component={Approvals} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/agency-stats" component={AgencyStats} />
          <Route path="/sns-accounts" component={SnsAccounts} />
          <Route path="/sub-allocation-prices" component={SubAllocationPrices} />
          <Route path="/audit-logs" component={AuditLogs} />
          <Route component={NotFound} />
        </Switch>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={PartnerDashboard} />
        <Route path="/my-allocations" component={MyAllocations} />
        <Route path="/appointments/new" component={NewAppointment} />
        <Route path="/appointments" component={PartnerAppointments} />
        <Route path="/sub-partners" component={SubPartnerManagement} />
        <Route path="/notifications" component={Notifications} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AppRouter() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/login">
        <Redirect to="/" />
      </Route>
      <Route>
        <AuthenticatedRoutes />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <AppRouter />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
