import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  CssBaseline, Box, Toolbar, Typography, Divider
} from "@mui/material";
import {
  Dashboard, People, Videocam, Assessment, PendingActions, PersonAdd, AccessTime, Layers
} from "@mui/icons-material";
import AdminHeader from "../../components/AdminHeader";


const drawerWidth = 260;

const AdminMain: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activePage, setActivePage] = useState(location.pathname);

  const menuItems = [
    { text: "Dashboard", icon: <Dashboard />, path: "/dashboard/:id" },
    { text: "Faculty Info", icon: <People />, path: "/faculty-info/:id" },
    { text: "Course & Block Management", icon: <Layers />, path: "/course-block-management/:id" },
    { text: "Pending Faculty", icon: <PendingActions />, path: "/pending-faculty/:id" },
    { text: "Live Video", icon: <Videocam />, path: "/live-video/:id" },
    { text: "Time In/Out Breakdown", icon: <AccessTime />, path: "/faculty-time-breakdown/:id" },
    { text: "Generate Reports", icon: <Assessment />, path: "/faculty-reports/:id" },
    { text: "Face Registration", icon: <PersonAdd />, path: "/face-registration/:id" },
  ];

  const handleNavigate = (path: string) => {
    const facultyId = localStorage.getItem("userId");
    if (!facultyId) {
      console.error("No faculty ID found!");
      return;
    }
    const newPath = path.replace(":id", facultyId);
    setActivePage(newPath);
    navigate(newPath);
  };


  return (
    <Box sx={{ display: "flex", backgroundColor: "#f4f6f8", minHeight: "100vh" }}>
      <CssBaseline />

      <AdminHeader />

      {/* Sidebar */}
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
            const facultyId = localStorage.getItem("userId");
            const resolvedPath = item.path.replace(":id", facultyId || "");
            const isActive = activePage === resolvedPath;

            return (
              <React.Fragment key={item.text}>
                {item.text === "Faculty Info" && (
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
                  onClick={() => handleNavigate(item.path)}
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
                  <ListItemIcon sx={{ color: "#F8E5EE" }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </React.Fragment>
            );
          })}
        </List>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, p: 1, mt: 4 }}>
        {children}
      </Box>
    </Box>
  );
};

export default AdminMain;
