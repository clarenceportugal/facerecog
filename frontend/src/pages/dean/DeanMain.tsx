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
  History,
} from "@mui/icons-material";
import AdminHeader from "../../components/AdminHeader";

const drawerWidth = 260;

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
    {
      text: "Activity History",
      icon: <History />,
      path: `/dean-activity-history/${facultyId}`,
    },
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <Box
      sx={{ display: "flex", backgroundColor: "#f4f6f8", minHeight: "100vh" }}
    >
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
            backgroundColor: "#1e1e2d",
            color: "#ffffff",
          },
        }}
      >
        <Toolbar />
        <List>
          {menuItems.map((item) => (
            <React.Fragment key={item.text}>
              {item.text === `${CollegeName} Staff Info` && (
                <>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: "#ffffff",
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
                  <Divider
                    sx={{
                      backgroundColor: "rgba(255,255,255,0.2)",
                      mx: 2,
                      mb: 1,
                    }}
                  />
                </>
              )}

              <ListItemButton
                onClick={() => handleNavigate(item.path)}
                sx={{
                  color: activePage === item.path ? "#1e88e5" : "#ffffff",
                  backgroundColor:
                    activePage === item.path
                      ? "rgba(30,136,229,0.2)"
                      : "transparent",
                  borderRadius: "10px",
                  mx: 2,
                  my: 1,
                  "&:hover": { backgroundColor: "rgba(30,136,229,0.3)" },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: activePage === item.path ? "#1e88e5" : "#ffffff",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </React.Fragment>
          ))}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, pt: 2, mt: 8, overflow: "visible", minHeight: "calc(100vh - 64px)", width: "100%" }}>
        {children}
      </Box>
    </Box>
  );
};

export default DeanMain;
