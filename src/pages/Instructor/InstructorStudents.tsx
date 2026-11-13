import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router";
import {
    ChevronLeft,
    ChevronRight,
    MapPin,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import FilterPopover, { FilterField } from "@/components/FilterPopover";
import GradeBadge from "@/components/instructor/DatabaseGradeBadge";
import InstructorDataStatus from "@/components/instructor/InstructorDataStatus";
import { useAuth } from "@/hooks/use-auth";
import { useInstructorQuery } from "@/hooks/use-instructor-data";
import { instructorQueryKeys, instructorQueryTimes } from "@/lib/instructor/query-keys";
import type { QueryState } from "@/hooks/use-instructor-data";
import { toInstructorDataError } from "@/lib/instructor/errors";
import { useInstructorApi } from "@/lib/instructor/data-context";
import type { StudentDirectory } from "@/lib/instructor/types";
import { studentDetailsHref } from "@/lib/instructor-calendar";
import {
    changeDirectoryFilter,
    clearDirectoryFilters,
    directoryPage,
    directoryStudent,
    filterDirectorySnapshot,
    loadDirectorySnapshot,
    singaporeToday,
} from "@/lib/instructor/directory";
import SearchInput from "@/components/SearchInput";

export default function InstructorStudents() {
    const api = useInstructorApi();
    const { session, profile } = useAuth();
    const [params, setParams] = useSearchParams();
    const searchRef = useRef<HTMLInputElement>(null);
    const query = params.get("q") ?? "";
    const rank = params.get("rank") ?? "";
    const dojo = params.get("dojo") ?? "";
    const page = directoryPage(params);
    const [today, setToday] = useState(singaporeToday);
    useEffect(() => {
        const timer = window.setInterval(() => setToday(singaporeToday()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const loadDirectory = useCallback((signal: AbortSignal) => loadDirectorySnapshot(api.getStudents, signal), [api]);
    const snapshot = useInstructorQuery(instructorQueryKeys.directory, loadDirectory, instructorQueryTimes.student);
    const view = useMemo<QueryState<StudentDirectory>>(() => {
        if (snapshot.status === "loading") return { status: "loading", data: null, error: null };
        if (snapshot.status === "error") return { status: "error", data: null, error: snapshot.error };
        try {
            const filters = new URLSearchParams({ q: query, rank, dojo, page: String(page) });
            return { status: "success", data: filterDirectorySnapshot(snapshot.data, filters), error: null };
        } catch (error) {
            return { status: "error", data: null, error: toInstructorDataError(error, "Unable to filter student records.").message };
        }
    }, [snapshot.status, snapshot.data, snapshot.error, query, rank, dojo, page]);
    const data = { ...view, retry: snapshot.retry };
    const account = profile?.role === "instructor" ? session?.user.id : null;
    const [metadata, setMetadata] = useState<{ account: string; facets: StudentDirectory["facets"] } | null>(null);
    useEffect(() => {
        if (snapshot.status === "success" && account) setMetadata({ account, facets: snapshot.data.facets });
    }, [account, snapshot.status, snapshot.data]);
    // Keep only same-account filter metadata during refetches, never old rows or
    // counts. Popover choices and focus remain stable while the request runs.
    const facets = snapshot.data?.facets ?? (metadata?.account === account ? metadata?.facets : null);
    const grades = useMemo(() => [...(facets?.grades ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)), [facets]);
    const dojos = (facets?.centres ?? []).map(centre => ({ value: centre.id, label: centre.name }));
    const search = query.trim().toLowerCase();
    const hasFilters = Boolean(search || rank || dojo);
    const activeFilterCount = [rank, dojo].filter(Boolean).length;
    const pageCount = data.status === "success" ? Math.max(1, Math.ceil(data.data.total / data.data.limit)) : 1;
    const outOfRange = data.status === "success" && page > pageCount;
    const ready = data.status === "success" && !outOfRange;
    const directory = ready ? data.data.items.map(entry => directoryStudent(entry, today)) : [];
    useEffect(() => {
        if (!outOfRange) return;
        setParams(current => {
            if (directoryPage(current) !== page || (current.get("q") ?? "") !== query
                || (current.get("rank") ?? "") !== rank
                || (current.get("dojo") ?? "") !== dojo) return current;
            const next = new URLSearchParams(current);
            if (pageCount === 1) next.delete("page");
            else next.set("page", String(pageCount));
            return next;
        }, { replace: true });
    }, [outOfRange, pageCount, page, query, rank, dojo, setParams]);

    function updateFilter(name: "q" | "rank" | "dojo", value: string) {
        setParams(
            (current) => {
                return changeDirectoryFilter(current, name, value);
            },
            { replace: true },
        );
    }

    function clearFilters() {
        setParams(
            (current) => {
                return clearDirectoryFilters(current, true);
            },
            { replace: true },
        );
        searchRef.current?.focus();
    }

    function resetFilters() {
        setParams(
            (current) => {
                return clearDirectoryFilters(current, false);
            },
            { replace: true },
        );
    }

    function selectPage(nextPage: number) {
        setParams(current => {
            const next = new URLSearchParams(current);
            if (nextPage === 1) next.delete("page");
            else next.set("page", String(nextPage));
            return next;
        });
        searchRef.current?.focus({ preventScroll: true });
    }

    return (
        <section aria-busy={data.status === "loading" || outOfRange} className="student-directory-view space-y-2 md:space-y-6">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
            </header>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <SearchInput
                    ref={searchRef}
                    aria-label="Search by name or student ID"
                    placeholder="Name or ID…"
                    value={query}
                    maxLength={200}
                    onChange={(event) => updateFilter("q", event.target.value)}
                    className="directory-control"
                    wrapperClassName="min-w-0 basis-32"
                />
                <FilterPopover
                    title="Filter students"
                    activeCount={activeFilterCount}
                    onReset={resetFilters}
                    controlClassName="directory-control"
                    contentClassName="student-directory-filters"
                    titleClassName="directory-popover-title"
                >
                    <FilterField
                        label="Grade"
                        value={rank}
                        onChange={(value) => updateFilter("rank", value)}
                        ariaLabel="Grade filter"
                        emptyText="No grade found."
                        className="directory-control h-11 lg:h-10"
                        contentClassName="student-directory-filter-menu"
                        options={[{ value: "", label: "All grades" }, ...grades.map((grade) => ({ value: grade.id, label: grade.label }))]}
                        renderOption={(option) => {
                            const grade = grades.find((item) => item.id === option.value);
                            return grade ? <GradeBadge grade={grade} showBeltLabel /> : option.label;
                        }}
                    />
                    <FilterField
                        label="Dojo"
                        value={dojo}
                        onChange={(value) => updateFilter("dojo", value)}
                        ariaLabel="Dojo filter"
                        emptyText="No dojo found."
                        className="directory-control h-11 lg:h-10"
                        contentClassName="student-directory-filter-menu"
                        options={[{ value: "", label: "All dojos" }, ...dojos]}
                    />
                </FilterPopover>
            </div>
            <div className="space-y-4">
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
                    <p
                        role="status"
                        className="directory-meta text-xs text-muted-foreground"
                    >
                        {ready ? hasFilters
                            ? `${data.data.total} of ${data.data.scopeTotal} students`
                            : `${data.data.total} ${data.data.total === 1 ? "student" : "students"}`
                            : data.status === "error" ? "Student count unavailable" : "Loading students…"}
                    </p>
                    {hasFilters && (
                        <Button
                            variant="ghost"
                            size="touch"
                            className="directory-control shrink-0"
                            aria-label="Clear all search and filters"
                            onClick={clearFilters}
                        >
                            Clear all
                        </Button>
                    )}
                </div>
                <Card className="gap-0 overflow-hidden py-0">
                    <CardContent className="px-0">
                        {!ready && data.status !== "error" ? <InstructorDataStatus loading onRetry={data.retry} variant="directory" />
                        : data.status === "error" ? <InstructorDataStatus error={data.error} onRetry={data.retry} />
                        : directory.length ? (
                            <ul className="divide-y" aria-label="Student directory">
                                {directory.map((student) => (
                                    <li key={student.id}>
                                        {/* The name link stretches over the whole row, so the grade
                                            badge can be its own button without nesting it in a link. */}
                                        <div
                                            data-member-no={student.memberNo}
                                            className="relative flex min-h-17 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 has-[a:focus-visible]:bg-muted/50 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                                                    <Link
                                                        to={studentDetailsHref(student.id)}
                                                        className="directory-name min-w-0 flex-1 basis-24 text-sm font-medium [overflow-wrap:anywhere] outline-none after:absolute after:inset-0"
                                                    >
                                                        {student.name}
                                                    </Link>
                                                </div>
                                                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:mt-1">
                                                    {student.grade ? (
                                                        <button
                                                            type="button"
                                                            className="relative z-10 max-w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                                            aria-label={rank === student.grade.id
                                                                ? `Showing ${student.grade.label} only. Show all grades`
                                                                : `Show only ${student.grade.label}`}
                                                            aria-pressed={rank === student.grade.id}
                                                            title={rank === student.grade.id ? "Show all grades" : `Show only ${student.grade.label}`}
                                                            onClick={() => updateFilter("rank", rank === student.grade?.id ? "" : student.grade!.id)}
                                                        >
                                                            <GradeBadge
                                                                grade={student.grade}
                                                                className="hover:border-foreground/40"
                                                            />
                                                        </button>
                                                    ) : (
                                                        <GradeBadge grade={null} />
                                                    )}
                                                    <p className="directory-meta min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                                        {student.trackLabel}
                                                    </p>
                                                </div>
                                                <p className="directory-meta mt-2 flex items-center gap-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere] sm:hidden">
                                                    <MapPin
                                                        aria-hidden="true"
                                                        className="size-3.5 shrink-0"
                                                    />
                                                    {student.principalDojo}
                                                </p>
                                            </div>
                                            <span className="directory-meta hidden max-w-[35%] shrink-0 items-center gap-1.5 text-left text-xs text-muted-foreground [overflow-wrap:anywhere] sm:flex">
                                                <MapPin
                                                    aria-hidden="true"
                                                    className="size-3.5 shrink-0"
                                                />
                                                {student.principalDojo}
                                            </span>
                                            <ChevronRight
                                                aria-hidden="true"
                                                className="size-4 shrink-0 text-muted-foreground"
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="space-y-2 px-4 py-8 text-center sm:py-12">
                                <Users
                                    aria-hidden="true"
                                    className="mx-auto size-6 text-muted-foreground"
                                />
                                <h2 className="text-sm font-semibold">{hasFilters ? "No students found" : "No students yet"}</h2>
                                <p className="directory-copy text-sm text-muted-foreground">
                                    {hasFilters ? "Try another name, student ID, grade or dojo." : "No student records are available."}
                                </p>
                                <Button
                                    variant="outline"
                                    size="touch"
                                    className="directory-control mt-2 h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 lg:min-h-10"
                                    onClick={hasFilters ? clearFilters : data.retry}
                                >
                                    {hasFilters ? "Clear search and filters" : "Refresh students"}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
                {ready && pageCount > 1 && <nav aria-label="Student directory pages" className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="outline" size="touch" disabled={page === 1} onClick={() => selectPage(page - 1)}>
                        <ChevronLeft aria-hidden="true" />Previous
                    </Button>
                    <p className="directory-meta text-xs text-muted-foreground">Page {page} of {pageCount}</p>
                    <Button variant="outline" size="touch" disabled={page === pageCount} onClick={() => selectPage(page + 1)}>
                        Next<ChevronRight aria-hidden="true" />
                    </Button>
                </nav>}
            </div>
        </section>
    );
}
