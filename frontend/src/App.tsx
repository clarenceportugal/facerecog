import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import Login from "./pages/Login";
import RequiresCompletion from "./pages/RequiresCompletion";
import PageNotFound from "./pages/PageNotFound";
{
  /* for programchairperson*/
}
import AdminMain from "./pages/programchairperson/AdminMain";
import Dashboard from "./pages/programchairperson/Dashboard";
import FacultyInfo from "./pages/programchairperson/FacultyInfo";
import LiveVideo from "./pages/programchairperson/LiveVideo";
import UserMain from "./pages/user/UserMain";
import FacultyReports from "./pages/programchairperson/FacultyReports";
import PendingFaculty from "./pages/programchairperson/PendingFaculty";
import FaceRegistration from "./pages/programchairperson/FaceRegistration";
import CameraTest from "./components/CameraTest";
import TimeBreakdown from "./pages/programchairperson/TimeBreakdown";
import CourseBlockManagement from "./pages/programchairperson/CourseBlockManagement";
import ActivityHistory from "./pages/programchairperson/ActivityHistory";
{
  /* for faculty*/
}
import UpdateCredentials from "./pages/user/UpdateCredentials";
import FacultyDashboard from "./pages/user/FacultyDashboard";
import FacultySchedule from "./pages/user/FacultySchedule";
import FacultyAttendance from "./pages/user/FacultyAttendance";
import { FacultyProvider } from "./context/FacultyContext";
{
  /* for superadmin*/
}
import SuperadminMain from "./pages/superadmin/SuperadminMain";
import SuperadminDashboard from "./pages/superadmin/SuperadminDashboard";
import DeanInfo from "./pages/superadmin/DeanInfo";
import ProgramChairInfoOnly from "./pages/superadmin/ProgramChairInfoOnly";
import InstructorInfoOnly from "./pages/superadmin/InstructorInfoOnly";
import PendingInstructors from "./pages/superadmin/PendingInstructors";
import PendingProgramchairpersons from "./pages/superadmin/PendingProgramchairpersons";
import PendingDeans from "./pages/superadmin/PendingDeans";
{
  /* for dean*/
}
import DeanMain from "./pages/dean/DeanMain";
import DeanDashboard from "./pages/dean/DeanDashboard";
import DeanCourseBlockManagement from "./pages/dean/DeanCourseBlockManagement";
import ProgramchairInfo from "./pages/dean/ProgramchairInfo";
import DeanLiveVideo from "./pages/dean/DeanLiveVideo";
import PendingStaff from "./pages/dean/PendingStaff";
import DeanFaceRegistration from "./pages/dean/FaceRegistration";
import DeanFacultyReports from "./pages/dean/DeanFacultyReport";
import DeanTimeBreakdown from "./pages/dean/DeanTimeBreakdown";
import DeanActivityHistory from "./pages/dean/DeanActivityHistory";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        <Route path="/update-credentials/:id" element={<UpdateCredentials />} />
        <Route
          path="/requires-completion/:id"
          element={<RequiresCompletion />}
        />

        {/* Superadmin Routes */}
        <Route
          path="/superadmin-dashboard/:id"
          element={
            <SuperadminMain>
              <SuperadminDashboard />
            </SuperadminMain>
          }
        />

        <Route
          path="/dean-info/:id"
          element={
            <SuperadminMain>
              <DeanInfo />
            </SuperadminMain>
          }
        />

        <Route
          path="/programchairinfo-only/:id"
          element={
            <SuperadminMain>
              <ProgramChairInfoOnly />
            </SuperadminMain>
          }
        />

        <Route
          path="/instructorinfo-only/:id"
          element={
            <SuperadminMain>
              <InstructorInfoOnly />
            </SuperadminMain>
          }
        />

        <Route
          path="/pending-instructors/:id"
          element={
            <SuperadminMain>
              <PendingInstructors />
            </SuperadminMain>
          }
        />
        <Route
          path="/pending-programchairpersons/:id"
          element={
            <SuperadminMain>
              <PendingProgramchairpersons />
            </SuperadminMain>
          }
        />
        <Route
          path="/pending-deans/:id"
          element={
            <SuperadminMain>
              <PendingDeans />
            </SuperadminMain>
          }
        />
        {/* Dean Routes */}
        <Route
          path="/dean-dashboard/:id"
          element={
            <DeanMain>
              <DeanDashboard />
            </DeanMain>
          }
        />

        <Route
          path="/dean-faculty-reports/:id"
          element={
            <DeanMain>
              <DeanFacultyReports />
            </DeanMain>
          }
        />

        <Route
          path="/dean-course-block-management/:id"
          element={
            <DeanMain>
              <DeanCourseBlockManagement />
            </DeanMain>
          }
        />

        <Route
          path="/dean-faculty-time-breakdown/:id"
          element={
            <DeanMain>
              <DeanTimeBreakdown />
            </DeanMain>
          }
        />

        <Route
          path="/programchair-info/:id"
          element={
            <FacultyProvider>
              <DeanMain>
                <ProgramchairInfo />
              </DeanMain>
            </FacultyProvider>
          }
        />

        <Route
          path="/deanlivevideo/:id"
          element={
            <DeanMain>
              <DeanLiveVideo />
            </DeanMain>
          }
        />

        <Route
          path="/pending-staff/:id"
          element={
            <DeanMain>
              <PendingStaff />
            </DeanMain>
          }
        />

        <Route
          path="/dean-face-registration/:id"
          element={
            <DeanMain>
              <DeanFaceRegistration />
            </DeanMain>
          }
        />

        <Route
          path="/dean-activity-history/:id"
          element={
            <DeanMain>
              <DeanActivityHistory />
            </DeanMain>
          }
        />

        {/* User Routes */}
        <Route
          path="/faculty-dashboard/:id"
          element={
            <UserMain>
              <FacultyDashboard />
            </UserMain>
          }
        />

        <Route
          path="/user-schedule/:id"
          element={
            <UserMain>
              <FacultySchedule />
            </UserMain>
          }
        />

        <Route
          path="/faculty-attendance/:id"
          element={
            <UserMain>
              <FacultyAttendance />
            </UserMain>
          }
        />

        {/* Programchairperson Routes */}
        <Route
          path="/dashboard/:id"
          element={
            <AdminMain>
              <Dashboard />
            </AdminMain>
          }
        />

        <Route
          path="/face-registration/:id"
          element={
            <AdminMain>
              <FaceRegistration />
            </AdminMain>
          }
        />

        <Route
          path="/faculty-info/:id"
          element={
            <FacultyProvider>
              <AdminMain>
                <FacultyInfo />
              </AdminMain>
            </FacultyProvider>
          }
        />

        <Route
          path="/pending-faculty/:id"
          element={
            <AdminMain>
              <PendingFaculty />
            </AdminMain>
          }
        />

        <Route
          path="/live-video/:id"
          element={
            <AdminMain>
              <LiveVideo />
            </AdminMain>
          }
        />

        <Route
          path="/faculty-reports/:id"
          element={
            <AdminMain>
              <FacultyReports />
            </AdminMain>
          }
        />

        <Route
          path="/faculty-time-breakdown/:id"
          element={
            <AdminMain>
              <TimeBreakdown />
            </AdminMain>
          }
        />

        <Route
          path="/course-block-management/:id"
          element={
            <AdminMain>
              <CourseBlockManagement />
            </AdminMain>
          }
        />

        <Route
          path="/activity-history/:id"
          element={
            <AdminMain>
              <ActivityHistory />
            </AdminMain>
          }
        />

        <Route
          path="/camera-test"
          element={<CameraTest />}
        />

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Router>
  );
}
