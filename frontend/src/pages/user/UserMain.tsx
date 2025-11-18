import React, { useState } from "react";
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
import { Dashboard, CalendarToday, Assessment } from "@mui/icons-material";
import AdminHeader from "../../components/AdminHeader";

const drawerWidth = 260;

const UserMain: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activePage, setActivePage] = useState(location.pathname);

  const menuItems = [
    { text: "Dashboard", icon: <Dashboard />, path: "/faculty-dashboard/:id" },
    { text: "Schedule", icon: <CalendarToday />, path: "/user-schedule/:id" },
    { text: "Attendance", icon: <Assessment />, path: "/faculty-attendance/:id" },
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
              {item.text === "Faculty Info" && (
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

      <Box component="main" sx={{ flexGrow: 1, p: 1, mt: 4 }}>
        {children}
      </Box>
    </Box>
  );
};

export default UserMain;
