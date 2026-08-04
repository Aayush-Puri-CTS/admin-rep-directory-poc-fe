import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PrivateRoute } from './components/PrivateRoute';
import { RepDirectoryPage } from './pages/RepDirectoryPage';
import { CreateRepPage } from './pages/CreateRepPage';
import { RepDetailPage } from './pages/RepDetailPage';
import { LogoutCallback } from './pages/LogoutCallback';

export default function App() {
  return (
    <Routes>
      {/* Outside Layout: Keycloak's front-channel logout target, not a dashboard page. */}
      <Route path="logout-callback" element={<LogoutCallback />} />
      <Route element={<Layout />}>
        <Route element={<PrivateRoute />}>
          <Route index element={<RepDirectoryPage />} />
          <Route path="reps/new" element={<CreateRepPage />} />
          <Route path="reps/:repId" element={<RepDetailPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
