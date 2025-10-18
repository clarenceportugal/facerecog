import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Toolbar, Typography, IconButton, Box } from "@mui/material";
import { Logout } from "@mui/icons-material";
import Swal from "sweetalert2";
import axios from "axios";


const AdminHeader: React.FC = () => {
  const navigate = useNavigate();

  const name = localStorage.getItem("userId");
  const [userName, setUserName] = useState<string>("");  
  

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const response = await axios.get(`https://eduvision-dura.onrender.com/api/auth/user/name`, {
          params: { name: name }
        });
        console.log("User name response:", response.data);
  
        const { last_name, first_name, middle_name } = response.data;
        const fullName = `${last_name}, ${first_name} ${middle_name || ""}`;
        setUserName(fullName.trim());
      } catch (error) {
        console.error("Failed to fetch user name:", error);
      }
    };
  
    if (name) {
      fetchUserName();
    }
  }, [name]);

  const handleLogout = () => {
    Swal.fire({
      title: "Are you sure?",
      text: "You will be logged out.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#9F2042",
      cancelButtonColor: "#7B0D1E",
      confirmButtonText: "Yes, log out",
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.clear();
        navigate("/");
      }
    });
  };

  return (
    <AppBar position="fixed" sx={{ zIndex: 1201, backgroundColor: "#7B0D1E" }}>
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1, color: "#F8E5EE" }}>
          EduVision Panel
        </Typography>

        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="subtitle1" sx={{ color: "#F8E5EE" }}>
            {userName}
          </Typography>
          <IconButton
            onClick={handleLogout}
            sx={{
              color: "#F8E5EE",
              "&:hover": {
                color: "#FFD7E8",
              },
            }}
          >
            <Logout />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default AdminHeader;
