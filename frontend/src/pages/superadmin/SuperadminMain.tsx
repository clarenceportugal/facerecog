import React from "react";
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
  School,
  AssignmentInd,
  Person,
  Tune as TuneIcon,
  HourglassEmpty,
  PendingActions,
  Schedule,
} from "@mui/icons-material";
import AdminHeader from "../../components/AdminHeader";

const drawerWidth = 260;

const SuperadminMain: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const facultyId = localStorage.getItem("userId");

  const menuItems = [
    {
      text: "Dashboard",
      icon: <Dashboard />,
      path: "/superadmin-dashboard/:id",
    },
    { text: "Dean", icon: <School />, path: "/dean-info/:id" },
    {
      text: "Program Chairperson",
      icon: <AssignmentInd />,
      path: "/programchairinfo-only/:id",
    },
    { text: "Instructor", icon: <Person />, path: "/instructorinfo-only/:id" },

    // 🔹 Pending Accounts section
    {
      text: "Pending Instructors",
      icon: <HourglassEmpty />,
      path: "/pending-instructors/:id",
    },
    {
      text: "Pending Program Chairpersons",
      icon: <PendingActions />,
      path: "/pending-programchairpersons/:id",
    },
    { text: "Pending Deans", icon: <Schedule />, path: "/pending-deans/:id" },

    { text: "Live Video", icon: <Videocam />, path: "/deanlivevideo/:id" },
    { text: "Camera Settings", icon: <TuneIcon />, path: "/deanlivevideo/:id" },
  ];

  const handleNavigate = (path: string) => {
    if (!facultyId) {
      console.error("No faculty ID found!");
      return;
    }
    navigate(path.replace(":id", facultyId));
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
            backgroundColor: "#3D1308",
            color: "#ffffff",
            overflowY: "auto", // 🔹 Enable scrolling
            scrollbarWidth: "thin", // Firefox support
            scrollbarColor: "rgba(255,255,255,0.3) transparent",

            // 🔹 Floating modern scrollbar (WebKit)
            "&::-webkit-scrollbar": {
              width: "6px",
            },
            "&::-webkit-scrollbar-track": {
              background: "transparent", // no fixed track → floating
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(255,255,255,0.3)", // semi-transparent thumb
              borderRadius: "10px",
              visibility: "hidden", // hidden until hover/scroll
            },
            "&:hover::-webkit-scrollbar-thumb, &:active::-webkit-scrollbar-thumb":
              {
                visibility: "visible", // show when user interacts
              },
          },
        }}
      >
        <Toolbar />
        <List>
          {menuItems.map((item) => {
            const resolvedPath = facultyId
              ? item.path.replace(":id", facultyId)
              : item.path;
            const isActive = location.pathname === resolvedPath;

            return (
              <React.Fragment key={item.text}>
                {item.text === "Dean" && (
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
                      Users Info
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

                {/* 🔹 Section title before pending accounts */}
                {item.text === "Pending Instructors" && (
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
                      Pending Accounts
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

                {item.text === "Live Video" && (
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
                      Cam Config
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
                    color: isActive ? "#1e88e5" : "#ffffff",
                    backgroundColor: isActive
                      ? "rgba(30,136,229,0.2)"
                      : "transparent",
                    borderRadius: "10px",
                    mx: 2,
                    my: 1,
                    "&:hover": { backgroundColor: "rgba(30,136,229,0.3)" },
                  }}
                >
                  <ListItemIcon
                    sx={{ color: isActive ? "#1e88e5" : "#ffffff" }}
                  >
                    {item.icon}
                  </ListItemIcon>
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

export default SuperadminMain;
