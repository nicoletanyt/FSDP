import { useId, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router";
import {
    ChevronDown,
    ChevronRight,
    MapPin,
    Search,
    SlidersHorizontal,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import GradeBadge from "@/components/GradeBadge";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { studentDetailsHref, students } from "@/lib/instructor-calendar";
import { getStudentProfile } from "@/lib/instructor-student-details";
import {
    belts,
    compareRanks,
    formatRank,
    getGrade,
    gradingSystems,
} from "@/lib/student-grades";

function DirectoryFilter({
    label,
    value,
    options,
    onValueChange,
}: {
    label: "Rank" | "Belt" | "Dojo";
    value: string;
    options: { value: string; label: string }[];
    onValueChange: (value: string) => void;
}) {
    const triggerId = useId();

    return (
        <div className="grid min-w-0 gap-1.5">
            <Label
                htmlFor={triggerId}
                className="shrink-0 text-sm text-muted-foreground"
            >
                {label}
            </Label>
            <DropdownMenu>
                <DropdownMenuTrigger
                    id={triggerId}
                    render={
                        <Button
                            variant="outline"
                            size="touch"
                            className="directory-control w-full min-w-0 justify-between gap-2"
                        />
                    }
                    aria-label={`${label}: ${options.find((option) => option.value === value)?.label || value || "All"}`}
                >
                    <span className="truncate">
                        {options.find((option) => option.value === value)?.label ||
                            value ||
                            "All"}
                    </span>
                    <ChevronDown aria-hidden="true" className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="student-directory-filter-menu"
                >
                    <DropdownMenuRadioGroup
                        value={value}
                        onValueChange={onValueChange}
                        aria-label={`${label} filter`}
                    >
                        <DropdownMenuRadioItem value="" closeOnClick>
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                                All{" "}
                                {label === "Rank"
                                    ? "ranks"
                                    : label === "Belt"
                                        ? "belts"
                                        : "dojos"}
                            </span>
                        </DropdownMenuRadioItem>
                        {options.map((option) => (
                            <DropdownMenuRadioItem
                                key={option.value}
                                value={option.value}
                                closeOnClick
                            >
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                    {option.label}
                                </span>
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export default function InstructorStudents() {
    const [params, setParams] = useSearchParams();
    const searchRef = useRef<HTMLInputElement>(null);
    const filterTriggerRef = useRef<HTMLButtonElement>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const query = params.get("q") ?? "";
    const belt = params.get("belt") ?? "";
    const rank = params.get("rank") ?? "";
    const dojo = params.get("dojo") ?? "";
    const today = new Date();
    const directory = students.map((student) => {
        const grade = getGrade(student.gradingSystem, student.rank);
        return {
            ...getStudentProfile(student, today),
            beltLabel: grade ? belts[grade.belt].label : "Rank not recorded",
        };
    });
    const ranks = [...new Set(directory.map((student) => student.rank))]
        .sort(compareRanks)
        .map((rank) => ({ value: rank, label: formatRank(rank) }));
    const beltOptions = [
        ...new Set(directory.map((student) => student.beltLabel)),
    ]
        .sort()
        .map((belt) => ({ value: belt, label: belt }));
    const dojos = [...new Set(directory.map((student) => student.principalDojo))]
        .sort()
        .map((dojo) => ({ value: dojo, label: dojo }));
    const search = query.trim().toLowerCase();
    const hasFilters = Boolean(search || rank || belt || dojo);
    const activeFilterCount = [rank, belt, dojo].filter(Boolean).length;
    const filtered = directory.filter(
        (student) =>
            `${student.name} ${student.studentNumber}`
                .toLowerCase()
                .includes(search) &&
            (!rank || student.rank === rank) &&
            (!belt || student.beltLabel === belt) &&
            (!dojo || student.principalDojo === dojo),
    );

    function updateFilter(name: "q" | "rank" | "belt" | "dojo", value: string) {
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (value) next.set(name, value);
                else next.delete(name);
                return next;
            },
            { replace: true },
        );
    }

    function clearFilters() {
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                for (const name of ["q", "rank", "belt", "dojo"]) next.delete(name);
                return next;
            },
            { replace: true },
        );
        searchRef.current?.focus();
    }

    function resetFilters() {
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                for (const name of ["rank", "belt", "dojo"]) next.delete(name);
                return next;
            },
            { replace: true },
        );
    }

    return (
        <section className="student-directory-view space-y-2 md:space-y-6">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
            </header>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="relative min-w-0 flex-1 basis-32">
                    <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        type="search"
                        ref={searchRef}
                        aria-label="Search by name or student ID"
                        placeholder="Name or ID…"
                        value={query}
                        onChange={(event) => updateFilter("q", event.target.value)}
                        className="directory-control h-11 bg-background pl-9 lg:h-10"
                    />
                </div>
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <PopoverTrigger
                        ref={filterTriggerRef}
                        render={
                            <Button
                                variant="outline"
                                size="touch"
                                className="directory-control gap-2"
                            />
                        }
                        aria-label={
                            activeFilterCount
                                ? `Filter students, ${activeFilterCount} active filters`
                                : "Filter students"
                        }
                    >
                        <SlidersHorizontal aria-hidden="true" className="size-4" />
                        <span>Filter</span>
                        {activeFilterCount > 0 && (
                            <span
                                aria-hidden="true"
                                className="directory-filter-count flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                            >
                                {activeFilterCount}
                            </span>
                        )}
                    </PopoverTrigger>
                    <PopoverContent
                        className="student-directory-filters w-80 gap-3"
                        finalFocus={filterTriggerRef}
                    >
                        <div className="space-y-1">
                            <PopoverTitle className="directory-popover-title">
                                Filter students
                            </PopoverTitle>
                        </div>
                        <DirectoryFilter
                            label="Rank"
                            value={rank}
                            options={ranks}
                            onValueChange={(value) => updateFilter("rank", value)}
                        />
                        <DirectoryFilter
                            label="Belt"
                            value={belt}
                            options={beltOptions}
                            onValueChange={(value) => updateFilter("belt", value)}
                        />
                        <DirectoryFilter
                            label="Dojo"
                            value={dojo}
                            options={dojos}
                            onValueChange={(value) => updateFilter("dojo", value)}
                        />
                        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
                            <Button
                                variant="ghost"
                                size="touch"
                                className="directory-control h-auto min-h-11 max-w-full whitespace-normal py-2 lg:min-h-10"
                                disabled={!activeFilterCount}
                                onClick={resetFilters}
                            >
                                Reset filters
                            </Button>
                            <Button
                                size="touch"
                                className="directory-control h-auto min-h-11 max-w-full whitespace-normal py-2 lg:min-h-10"
                                onClick={() => setFiltersOpen(false)}
                            >
                                Done
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
            <div className="space-y-4">
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
                    <p
                        role="status"
                        className="directory-meta text-xs text-muted-foreground"
                    >
                        {hasFilters
                            ? `${filtered.length} of ${students.length} students`
                            : `${students.length} students`}
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
                        {filtered.length ? (
                            <ul className="divide-y" aria-label="Student directory">
                                {filtered.map((student) => (
                                    <li key={student.id}>
                                        <Link
                                            to={studentDetailsHref(student.id)}
                                            className="flex min-h-17 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                                                    <p className="directory-name min-w-0 flex-1 basis-24 text-sm font-medium [overflow-wrap:anywhere]">
                                                        {student.name}
                                                    </p>
                                                </div>
                                                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:mt-1">
                                                    <GradeBadge
                                                        rank={student.rank}
                                                        system={student.gradingSystem}
                                                    />
                                                    <p className="directory-meta min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                                        {gradingSystems[student.gradingSystem].label}
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
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="space-y-2 px-4 py-8 text-center sm:py-12">
                                <Users
                                    aria-hidden="true"
                                    className="mx-auto size-6 text-muted-foreground"
                                />
                                <h2 className="text-sm font-semibold">No students found</h2>
                                <p className="directory-copy text-sm text-muted-foreground">
                                    Try another name, student ID, rank, belt or dojo.
                                </p>
                                <Button
                                    variant="outline"
                                    size="touch"
                                    className="directory-control mt-2 h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 lg:min-h-10"
                                    onClick={clearFilters}
                                >
                                    Clear search and filters
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}
