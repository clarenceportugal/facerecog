//FacultyContext
// context/FacultyContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import axios from "axios";
import { API_BASE_URL } from "../utils/api";

interface Faculty {
  _id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  status: string;
  profilePhotoUrl?: string;
}

interface FacultyContextType {
  facultyList: Faculty[];
  setFacultyList: React.Dispatch<React.SetStateAction<Faculty[]>>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const FacultyContext = createContext<FacultyContextType | undefined>(undefined);

export const FacultyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // fetch function supports optional AbortSignal
  const fetchFaculty = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const CourseName = localStorage.getItem("course") ?? "";

      const res = await axios.get(`${API_BASE_URL}/api/auth/faculty`, {
        params: { courseName: CourseName },
        // axios accepts AbortSignal via `signal` (axios v1+)
        signal,
      });

      setFacultyList(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      // ignore cancellation
      const isCanceled =
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.message === "canceled";
      if (!isCanceled) {
        console.error("Error fetching faculty data:", err);
        setError(err?.response?.data?.message ?? err?.message ?? "Failed to fetch faculty data");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // initial fetch with abort controller
  useEffect(() => {
    const controller = new AbortController();
    fetchFaculty(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchFaculty]);

  // exposed refetch for consumers
  const refetch = useCallback(async () => {
    // no signal used here—caller likely wants a fresh request
    await fetchFaculty();
  }, [fetchFaculty]);

  return (
    <FacultyContext.Provider value={{ facultyList, setFacultyList, loading, error, refetch }}>
      {children}
    </FacultyContext.Provider>
  );
};

export const useFacultyContext = () => {
  const context = useContext(FacultyContext);
  if (!context) {
    throw new Error("useFacultyContext must be used within a FacultyProvider");
  }
  return context;
};
