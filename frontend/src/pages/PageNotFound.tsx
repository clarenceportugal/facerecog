import React from "react";
import { Box, Typography, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

/** Simple Robot SVG as a React component (self-contained) */
const RobotIcon: React.FC<{ size?: number }> = ({ size = 300 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Friendly robot illustration"
  >
    {/* outer card */}
    <rect x="14" y="36" width="92" height="58" rx="10" fill="#FFFFFF" />
    {/* inner body with stroke */}
    <rect
      x="20"
      y="42"
      width="80"
      height="46"
      rx="8"
      fill="#fff"
      stroke="#f44336"
      strokeWidth="2"
    />
    {/* robot head */}
    <rect x="40" y="8" width="40" height="22" rx="5" />
    {/* eyes (y slightly up for visual balance) */}
    <circle cx="48" cy="60" r="6" fill="#f44336" />
    <circle cx="72" cy="60" r="6" fill="#f44336" />
    {/* centered mouth: symmetric cubic Bezier from x=48 to x=72 with center at x=60 */}
    <path
      d="M48 72 C54 78 66 78 72 72"
      stroke="#f44336"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    />
    {/* small feet / side panels */}
    <rect x="12" y="80" width="18" height="6" rx="3" fill="rgba(0,0,0,0.04)" />
    <rect x="90" y="80" width="18" height="6" rx="3" fill="rgba(0,0,0,0.04)" />
  </svg>
);

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(180deg,#b71c1c 0%, #c62828 60%, #ef5350 100%)",
        p: 3,
      }}
    >
      <Box
        sx={{
          maxWidth: 1100,
          width: "100%",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "420px 1fr" },
          gap: 4,
          alignItems: "center",
        }}
      >
        {/* Robot illustration */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
          }}
          aria-hidden="true"
        >
          <RobotIcon
            size={
              Math.min(
                380,
                typeof window !== "undefined" ? window.innerWidth * 0.35 : 300
              )
            }
          />
        </Box>

        {/* Content card */}
        <Box
          sx={{
            bgcolor: "common.white",
            color: "text.primary",
            borderRadius: 3,
            p: { xs: 3, md: 5 },
            boxShadow: 8,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
          role="region"
          aria-labelledby="notfound-title"
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(183,28,28,0.12), rgba(183,28,28,0.08))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-hidden
            >
              {/* small robot head/icon for accent */}
              <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden>
                <rect
                  x="4"
                  y="5"
                  width="16"
                  height="11"
                  rx="2"
                  fill="#fff"
                  stroke="#b71c1c"
                  strokeWidth="1.2"
                />
                <circle cx="9" cy="10.5" r="1.2" fill="#b71c1c" />
                <circle cx="15" cy="10.5" r="1.2" fill="#b71c1c" />
              </svg>
            </Box>

            <Typography id="notfound-title" variant="h4" component="h1" fontWeight={700}>
              404 — Page Not Found
            </Typography>
          </Box>

          <Typography variant="subtitle1" color="text.secondary">
            The page you are looking for cannot be found. It may have been moved,
            removed, or the URL may be incorrect.
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Please return to the login page to continue to EduVision.
          </Typography>

          <Box mt={2} display="flex" gap={2} alignItems="center">
            <Button
              variant="contained"
              size="large"
              onClick={() => navigate("/login")}
              sx={{
                backgroundColor: "#b71c1c",
                "&:hover": { backgroundColor: "#8e1717" },
                textTransform: "none",
                px: 3,
              }}
              aria-label="Return to Login"
            >
              Return to Login
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            If you believe this is an error, contact the EduVision support team.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default NotFound;
