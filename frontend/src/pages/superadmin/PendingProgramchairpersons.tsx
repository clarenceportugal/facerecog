import React, { useEffect, useState } from "react";
import axios from "axios";
import SuperadminMain from "./SuperadminMain";
import Swal from "sweetalert2";
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  DialogTitle,
  TablePagination,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface Faculty {
  _id: string;
  email: string;
  role: string;
  department: { name: string } | string;
  program?: { name: string } | string;
  profilePhoto: string;
  dateSignedUp?: string;
}

const PendingProgramchairpersons: React.FC = () => {
  const collegeName = localStorage.getItem("college") ?? "";

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    const fetchFaculty = async () => {
      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/auth/initial-staff",
          {
            params: { collegeName: collegeName },
          }
        );
        setFacultyList(response.data);
      } catch (error) {
        console.error("Error fetching faculty list:", error);
      } finally {
        setLoading(false);
      }
    };

    if (collegeName) {
      fetchFaculty();
    } else {
      setLoading(false);
    }
  }, [collegeName]);

  const handleAccept = async (facultyId: string) => {
    const confirm = await Swal.fire({
      title: "Are you sure?",
      text: "You are about to accept this faculty member.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, accept",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#4CAF50",
      cancelButtonColor: "#f44336",
    });

    if (confirm.isConfirmed) {
      try {
        Swal.fire({
          title: "Processing...",
          text: "Accepting faculty member...",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const response = await axios.put(
          `https://eduvision-dura.onrender.com/api/auth/approve-faculty/${facultyId}`
        );
        console.log(response.data);

        Swal.fire({
          title: "Approved!",
          text: "Faculty has been accepted successfully.",
          icon: "success",
          confirmButtonColor: "#4CAF50",
        });

        setFacultyList((prev) => prev.filter((f) => f._id !== facultyId));

        const maxPage = Math.ceil((facultyList.length - 1) / rowsPerPage);
        if (page > maxPage) setPage(maxPage > 0 ? maxPage : 1);
      } catch (error) {
        console.error("Error approving faculty:", error);
        Swal.fire({
          title: "Error",
          text: "Failed to approve faculty. Please try again.",
          icon: "error",
          confirmButtonColor: "#f44336",
        });
      }
    }
  };

  const handleReject = async (facultyId: string) => {
    const confirm = await Swal.fire({
      title: "Are you sure?",
      text: "You are about to reject this faculty member.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, reject",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f44336",
      cancelButtonColor: "#9e9e9e",
    });

    if (confirm.isConfirmed) {
      try {
        Swal.fire({
          title: "Processing...",
          text: "Rejecting faculty member...",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const response = await axios.put(
          `https://eduvision-dura.onrender.com/api/auth/reject-faculty/${facultyId}`
        );
        console.log(response.data);

        Swal.fire({
          title: "Rejected!",
          text: "Faculty has been rejected successfully.",
          icon: "success",
          confirmButtonColor: "#f44336",
        });

        setFacultyList((prev) => prev.filter((f) => f._id !== facultyId));

        const maxPage = Math.ceil((facultyList.length - 1) / rowsPerPage);
        if (page > maxPage) setPage(maxPage > 0 ? maxPage : 1);
      } catch (error) {
        console.error("Error rejecting faculty:", error);
        Swal.fire({
          title: "Error",
          text: "Failed to reject faculty. Please try again.",
          icon: "error",
          confirmButtonColor: "#f44336",
        });
      }
    }
  };

  const paginatedFacultyList = facultyList.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <SuperadminMain>
      <Box>
        <Typography variant="h4" fontWeight="bold" color="#333" gutterBottom>
          Pending Programchairperson {collegeName && `- ${collegeName.toUpperCase()}`}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          <span style={{ fontWeight: 400 }}>
            List of faculty members whose registration or approval is still
            pending.
          </span>
        </Typography>

        <TableContainer component={Paper} elevation={3}>
          <Box sx={{ maxHeight: 500, overflow: "auto" }}>
            <Table stickyHeader>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  {[
                    "Profile",
                    "Email",
                    "Role",
                    "Department",
                    "Program",
                    "Date Signed Up",
                    "Actions",
                  ].map((header) => (
                    <TableCell
                      key={header}
                      sx={{
                        position: "sticky",
                        top: 0,
                        backgroundColor: "#f5f5f5",
                        zIndex: 1,
                        fontWeight: "bold",
                      }}
                      align={header === "Actions" ? "center" : "left"}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={30} />
                      <Typography mt={2} variant="body2" color="text.secondary">
                        Loading faculty list...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : facultyList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      No account pending for approval at the moment.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedFacultyList.map((faculty) => (
                    <TableRow key={faculty._id} hover>
                      <TableCell>
                        <Avatar
                          src={faculty.profilePhoto}
                          alt={faculty.email}
                          sx={{ cursor: "pointer" }}
                          onClick={() => {
                            setPreviewImage(faculty.profilePhoto);
                            setPreviewOpen(true);
                          }}
                        />
                      </TableCell>
                      <TableCell>{faculty.email}</TableCell>
                      <TableCell>{faculty.role}</TableCell>
                      <TableCell>
                        {typeof faculty.department === "string"
                          ? faculty.department
                          : faculty.department?.name ?? "N/A"}
                      </TableCell>
                      <TableCell>
                        {typeof faculty.program === "string"
                          ? faculty.program
                          : faculty.program?.name ?? "N/A"}
                      </TableCell>
                      <TableCell>
                        {faculty.dateSignedUp
                          ? new Date(faculty.dateSignedUp).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )
                          : "N/A"}
                      </TableCell>
                      <TableCell align="center">
                        <Box display="flex" justifyContent="center" gap={1}>
                          <button
                            style={{
                              backgroundColor:
                                hoveredBtn === `accept-${faculty._id}`
                                  ? "#45a049"
                                  : "#4CAF50",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 12px",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background-color 0.2s ease",
                            }}
                            onMouseEnter={() =>
                              setHoveredBtn(`accept-${faculty._id}`)
                            }
                            onMouseLeave={() => setHoveredBtn(null)}
                            onClick={() => handleAccept(faculty._id)}
                          >
                            Accept
                          </button>

                          <button
                            style={{
                              backgroundColor:
                                hoveredBtn === `reject-${faculty._id}`
                                  ? "#c62828"
                                  : "#f44336",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 12px",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background-color 0.2s ease",
                            }}
                            onMouseEnter={() =>
                              setHoveredBtn(`reject-${faculty._id}`)
                            }
                            onMouseLeave={() => setHoveredBtn(null)}
                            onClick={() => handleReject(faculty._id)}
                          >
                            Reject
                          </button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>

          {/* Pagination Controls */}
          <TablePagination
            component="div"
            count={facultyList.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{ px: 2 }}
          />
        </TableContainer>

        {/* Image Preview Dialog */}
        <Dialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ m: 0, p: 2 }}>
            Profile Photo
            <IconButton
              aria-label="close"
              onClick={() => setPreviewOpen(false)}
              sx={{
                position: "absolute",
                right: 8,
                top: 8,
                color: (theme) => theme.palette.grey[500],
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent
            dividers
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: 0,
            }}
          >
            <img
              src={previewImage ?? undefined}
              alt="Preview"
              style={{
                width: "100%",
                height: "auto",
                objectFit: "contain",
              }}
            />
          </DialogContent>
        </Dialog>
      </Box>
    </SuperadminMain>
  );
};

export default PendingProgramchairpersons;
