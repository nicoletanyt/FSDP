import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import EmptyState from "@/components/admin/EmptyState";
import GradeBadge from "@/components/instructor/DatabaseGradeBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/admin/export";
import { formatDate } from "@/lib/admin/format";
import type { GradeRow } from "@/lib/instructor/types";
import { supabase } from "@/lib/supabase";
import SearchInput from "@/components/SearchInput";

interface Application {
    id: string;
    submitted_at: string;
    target_grade_id: string;
    students: Student | Student[];
    gradings:
    | { grading_date: string | null; events: Event | Event[] }
    | { grading_date: string | null; events: Event | Event[] }[];
}

interface Student {
    first_name: string;
    last_name: string;
    member_no: string;
    current_grade_id: string;
}
interface Event {
    name: string;
}

function related<T>(value: T | T[] | null | undefined): T | undefined {
    return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export default function GradingApplications() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [grades, setGrades] = useState<Map<string, GradeRow>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");

    useEffect(() => {
        let active = true;
        void (async () => {
            const [applicationsResult, gradesResult] = await Promise.all([
                supabase
                    .from("grading_applications")
                    .select(
                        "id,submitted_at,target_grade_id,students(first_name,last_name,member_no,current_grade_id),gradings(grading_date,events(name))",
                    )
                    .order("submitted_at", { ascending: false }),
                supabase.from("grades").select("id,label,colour,is_ranked,sort_order"),
            ]);
            if (!active) return;
            if (applicationsResult.error || gradesResult.error) {
                setError("Unable to load grading applications and grades.");
            } else {
                const items = (applicationsResult.data ?? []) as Application[];
                const gradeMap = new Map(
                    (gradesResult.data ?? []).map((grade) => [grade.id, grade]),
                );
                if (
                    items.some((item) => {
                        const student = related(item.students);
                        return (
                            !gradeMap.has(item.target_grade_id) ||
                            (student && !gradeMap.has(student.current_grade_id))
                        );
                    })
                ) {
                    setError(
                        "Unable to resolve the current or target grade for an application.",
                    );
                } else {
                    setApplications(items);
                    setGrades(gradeMap);
                }
            }
            setLoading(false);
        })();
        return () => {
            active = false;
        };
    }, []);

    const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return applications
            .map((item) => ({
                item,
                student: related(item.students),
                grading: related(item.gradings),
            }))
            .map((row) => ({ ...row, event: related(row.grading?.events) }))
            .filter(({ student, event }) => {
                return (
                    student &&
                    event &&
                    (!needle ||
                        [
                            student.first_name,
                            student.last_name,
                            student.member_no,
                            event.name,
                        ].some((value) => value.toLowerCase().includes(needle)))
                );
            });
    }, [applications, query]);

    function exportApplications() {
        downloadCsv(
            "grading-applications.csv",
            [
                "Student",
                "Member number",
                "Grading",
                "Grading date",
                "Target grade",
                "Submitted date",
            ],
            rows.map(({ item, student, event, grading }) => [
                `${student!.first_name} ${student!.last_name}`,
                student!.member_no,
                event!.name,
                grading?.grading_date ?? "",
                item.target_grade_id,
                item.submitted_at,
            ]),
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <SearchInput
                    aria-label="Search applications"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find student or grading"
                />
                <Button
                    variant="outline"
                    disabled={rows.length === 0}
                    onClick={exportApplications}
                >
                    <Download /> Export CSV
                </Button>
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {loading ? (
                <p className="text-sm text-muted-foreground">Loading applications…</p>
            ) : error ? null : rows.length === 0 ? (
                <EmptyState
                    title="No applications found"
                    description="Paid applications appear here after the Stripe webhook confirms payment."
                />
            ) : (
                <Card className="overflow-hidden py-0">
                    <CardContent className="overflow-x-auto px-0">
                        <Table className="[&_th]:px-4 [&_td]:px-4 [&_td]:py-4 [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5">
                            <TableCaption className="sr-only">
                                Persisted grading applications
                            </TableCaption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Grading</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead>Submitted date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map(({ item, student, event, grading }) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <span className="font-medium">
                                                {student!.first_name} {student!.last_name}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {event!.name}
                                            <span className="block text-xs text-muted-foreground">
                                                {grading?.grading_date
                                                    ? formatDate(grading.grading_date)
                                                    : "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <GradeBadge
                                                    grade={grades.get(student!.current_grade_id) ?? null}
                                                />
                                                <span
                                                    aria-hidden="true"
                                                    className="text-muted-foreground"
                                                >
                                                    →
                                                </span>
                                                <GradeBadge
                                                    grade={grades.get(item.target_grade_id) ?? null}
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(item.submitted_at.slice(0, 10))}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
