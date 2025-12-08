import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CssBaseline,
  Box,
  Toolbar,
  Typography,
  Divider,
} from "@mui/material";
import {
  Dashboard,
  Videocam,
  People,
  PendingActions,
  Face,
  AccessTime,
  Assessment,
  Layers,
} from "@mui/icons-material";
import AdminHeader from "../../components/AdminHeader";

const drawerWidth = 260;

/**
 * Applied sidebar design:
 * - background: #3D1308
 * - text: #F8E5EE
 * - active background: #7B0D1E
 * - hover: #9F2042
 * - active right border: 5px solid #F8E5EE
 * - borderRadius: 10px
 */
const DeanMain: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const CollegeName = localStorage.getItem("college") ?? "";
  const facultyId = localStorage.getItem("userId") ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const [activePage, setActivePage] = useState(location.pathname);

  useEffect(() => {
    setActivePage(location.pathname);
  }, [location.pathname]);

  const menuItems = [
    {
      text: "Dashboard",
      icon: <Dashboard />,
      path: `/dean-dashboard/${facultyId}`,
    },
    {
      text: `${CollegeName} Staff Info`,
      icon: <People />,
      path: `/programchair-info/${facultyId}`,
    },
    { text: "Course & Block Management", icon: <Layers />, path: "/dean-course-block-management/:id" },
    {
      text: "Face Registration",
      icon: <Face />,
      path: `/dean-face-registration/${facultyId}`,
    },
    {
      text: "Pending Staff",
      icon: <PendingActions />,
      path: `/pending-staff/${facultyId}`,
    },
    {
      text: "Live Video",
      icon: <Videocam />,
      path: `/deanlivevideo/${facultyId}`,
    },
    {
      text: "Time In/Out Breakdown",
      icon: <AccessTime />,
      path: "/dean-faculty-time-breakdown/:id",
    },
    {
      text: "Generate Reports",
      icon: <Assessment />,
      path: "/dean-faculty-reports/:id",
    },
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <Box sx={{ display: "flex", backgroundColor: "#f4f6f8", minHeight: "100vh" }}>
      <CssBaseline />
      <AdminHeader />

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth - 130,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            backgroundColor: "#3D1308",
            color: "#F8E5EE",
          },
        }}
      >
        <Toolbar />
        <List>
          {menuItems.map((item) => {
            // Resolve possible :id placeholder so active detection works consistently
            const resolvedPath = item.path.includes(":id") ? item.path.replace(":id", facultyId) : item.path;
            const isActive = activePage === resolvedPath;

            return (
              <React.Fragment key={item.text}>
                {item.text === `${CollegeName} Staff Info` && (
                  <>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        color: "#F8E5EE",
                        textTransform: "uppercase",
                        fontWeight: "bold",
                        ml: 3,
                        mt: 2,
                        mb: 1,
                        opacity: 0.7,
                      }}
                    >
                      Faculty
                    </Typography>
                    <Divider sx={{ backgroundColor: "#4F1A0F", mx: 2, mb: 1 }} />
                  </>
                )}

                <ListItemButton
                  onClick={() => handleNavigate(resolvedPath)}
                  sx={{
                    color: "#F8E5EE",
                    backgroundColor: isActive ? "#7B0D1E" : "transparent",
                    borderRadius: "10px",
                    mx: 2,
                    my: 1,
                    borderRight: isActive ? "5px solid #F8E5EE" : "5px solid transparent",
                    "&:hover": {
                      backgroundColor: "#9F2042",
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: "#F8E5EE" }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </React.Fragment>
            );
          })}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 1, mt: 4 }}>
        {children}
      </Box>
    </Box>
  );
};

export default DeanMain;
