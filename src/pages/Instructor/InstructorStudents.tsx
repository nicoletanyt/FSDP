import { useId, useRef } from "react";
import { useSearchParams, Link } from "react-router";
import { ChevronDown, ChevronRight, Search, Users } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { studentDetailsHref, students } from "@/lib/instructor-calendar";
import {
    beltColorClass,
    getStudentProfile,
} from "@/lib/instructor-student-details";
import { cn } from "@/lib/utils";

function DirectoryFilter({
    label,
    value,
    options,
    onValueChange,
}: {
    label: "Belt" | "Dojo";
    value: string;
    options: string[];
    onValueChange: (value: string) => void;
}) {
    const triggerId = useId();

    return (
        <div className="flex min-w-0 items-center gap-2">
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
                            className="h-10 min-w-0 flex-1 justify-between gap-2 lg:min-w-24 lg:flex-none"
                        />
                    }
                    aria-label={`${label}: ${value || "All"}`}
                >
                    <span className="truncate">{value || "All"}</span>
                    <ChevronDown aria-hidden="true" className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                        value={value}
                        onValueChange={onValueChange}
                        aria-label={`${label} filter`}
                    >
                        <DropdownMenuRadioItem value="" closeOnClick>
                            All {label === "Belt" ? "belts" : "dojos"}
                        </DropdownMenuRadioItem>
                        {options.map((option) => (
                            <DropdownMenuRadioItem key={option} value={option} closeOnClick>
                                {option}
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
    const query = params.get("q") ?? "";
    const belt = params.get("belt") ?? "";
    const dojo = params.get("dojo") ?? "";
    const today = new Date();
    const directory = students.map((student) =>
        getStudentProfile(student, today),
    );
    const belts = [
        ...new Set(directory.map((student) => student.beltGrade)),
    ].sort();
    const dojos = [
        ...new Set(directory.map((student) => student.principalDojo)),
    ].sort();
    const search = query.trim().toLowerCase();
    const hasFilters = Boolean(search || belt || dojo);
    const filtered = directory.filter(
        (student) =>
            `${student.name} ${student.studentNumber}`
                .toLowerCase()
                .includes(search) &&
            (!belt || student.beltGrade === belt) &&
            (!dojo || student.principalDojo === dojo),
    );

    function updateFilter(name: "q" | "belt" | "dojo", value: string) {
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
                for (const name of ["q", "belt", "dojo"]) next.delete(name);
                return next;
            },
            { replace: true },
        );
        searchRef.current?.focus();
    }

    return (
        <section className="space-y-6">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
            </header>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative w-full min-w-0 lg:flex-1">
                    <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        type="search"
                        ref={searchRef}
                        aria-label="Search by name or student ID"
                        placeholder="Search by name or student ID..."
                        value={query}
                        onChange={(event) => updateFilter("q", event.target.value)}
                        className="h-10 bg-background pl-9"
                    />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:shrink-0">
                    <DirectoryFilter
                        label="Belt"
                        value={belt}
                        options={belts}
                        onValueChange={(value) => updateFilter("belt", value)}
                    />
                    <DirectoryFilter
                        label="Dojo"
                        value={dojo}
                        options={dojos}
                        onValueChange={(value) => updateFilter("dojo", value)}
                    />
                </div>
            </div>
            <div className="space-y-2">
                <p role="status" className="text-xs text-muted-foreground">
                    {hasFilters
                        ? `${filtered.length} of ${students.length} students`
                        : `${students.length} students`}
                </p>
                <Card className="gap-0 overflow-hidden py-0">
                    <CardContent className="px-0">
                        {filtered.length ? (
                            <ul className="divide-y" aria-label="Student directory">
                                {filtered.map((student) => (
                                    <li key={student.id}>
                                        <Link
                                            to={studentDetailsHref(student.id)}
                                            className="flex min-h-17 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring sm:px-6"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "size-3 shrink-0 rounded-full border",
                                                    beltColorClass(student.beltGrade),
                                                )}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">
                                                    {student.name}
                                                </p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {student.studentNumber} · {student.beltGrade}
                                                </p>
                                                <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                                                    {student.principalDojo}
                                                </p>
                                            </div>
                                            <span className="hidden text-xs text-muted-foreground sm:block">
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
                            <div className="space-y-2 px-6 py-12 text-center">
                                <Users
                                    aria-hidden="true"
                                    className="mx-auto size-6 text-muted-foreground"
                                />
                                <h2 className="font-medium">No students found</h2>
                                <p className="text-sm text-muted-foreground">
                                    Try another name, student ID, belt or dojo.
                                </p>
                                <Button
                                    variant="outline"
                                    className="mt-2"
                                    onClick={clearFilters}
                                >
                                    Clear filters
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}
