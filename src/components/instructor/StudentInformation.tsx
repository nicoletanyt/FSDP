import { CreditCard, HeartPulse, Mail, MapPin, Phone, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link } from "react-router";
import GradeBadge from "./DatabaseGradeBadge";
import { directoryStudent, singaporeToday } from "@/lib/instructor/directory";
import { studentDetailsHref } from "@/lib/instructor-calendar";
import type { StudentDetail } from "@/lib/instructor/types";

function StudentContactDetails({ detail }: { detail: StudentDetail }) {
    const { student } = detail;
    return (
        <section className="space-y-3 lg:space-y-2" aria-label="Contact information">
            <h3>Contact</h3>
            {student.email ? (
                <a href={`mailto:${student.email}`} className="detail-body flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-0 lg:py-1">
                    <Mail aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="break-all">{student.email}</span>
                </a>
            ) : <p className="detail-body text-sm text-muted-foreground">Email not recorded.</p>}
            {student.phone ? (
                <a href={`tel:${student.phone.replaceAll(" ", "")}`} className="detail-body flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:min-h-0 lg:py-1">
                    <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="break-all">{student.phone}</span>
                </a>
            ) : <p className="detail-body text-sm text-muted-foreground">Phone not recorded.</p>}
            <div className="space-y-3 border-t pt-4 lg:space-y-2 lg:pt-3" aria-label="Emergency contacts">
                <h3>Emergency contacts</h3>
                {detail.emergencyContacts.length ? detail.emergencyContacts.map((contact) => (
                    <div key={contact.id} className="space-y-1">
                        <p className="detail-body text-sm">
                            <span className="font-medium">{contact.name}</span>
                            <span className="text-muted-foreground"> · {contact.relationship}{contact.is_primary ? " · Primary" : ""}</span>
                        </p>
                        <a href={`tel:${contact.phone.replaceAll(" ", "")}`} className="detail-body inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline lg:min-h-0 lg:py-1">
                            {contact.phone}
                        </a>
                    </div>
                )) : <p className="detail-body text-sm text-muted-foreground">No emergency contacts recorded.</p>}
            </div>
        </section>
    );
}

export function StudentInformationCards({ detail }: { detail: StudentDetail }) {
    const profile = directoryStudent(detail, singaporeToday());
    const membership = detail.student.membership_status;
    return (
        <div className="space-y-3" aria-label="Student information">
            <Card size="sm" className="detail-card">
                <CardContent className="space-y-2">
                    <h3 className="detail-label text-xs text-muted-foreground">Grading</h3>
                    <GradeBadge grade={profile.grade} className="min-w-0 px-3 py-1.5" />
                    <p className="detail-meta text-sm text-muted-foreground">{profile.trackLabel}</p>
                </CardContent>
            </Card>
            <Card size="sm" className="detail-card">
                <CardContent className="space-y-2">
                    <h3 className="detail-label text-xs text-muted-foreground">Principal Dojo</h3>
                    <p className="detail-body flex items-center gap-1.5 text-sm">
                        <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                        {profile.principalDojo}
                    </p>
                </CardContent>
            </Card>
            <Card size="sm" className="detail-card">
                <CardContent className="space-y-2">
                    <h3 className="detail-label text-xs text-muted-foreground">Membership status</h3>
                    <p className={cn(
                        "detail-status inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium capitalize",
                        membership === "active" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground",
                    )}>
                        <CreditCard aria-hidden="true" className="size-3.5" />
                        {membership}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

export function StudentInformationActions({ detail, showDetailsLink = true }: { detail: StudentDetail; showDetailsLink?: boolean }) {
    return (
        <div className="flex flex-col gap-2 md:flex-1" aria-label="Contact and medical actions">
            <div className="grid grid-cols-2 gap-2">
                {(["contact", "medical"] as const).map((action) => (
                    <Dialog key={action}>
                        <DialogTrigger render={<Button variant="outline" size="touch" className="h-auto min-w-0 gap-2 px-3 py-2 whitespace-normal" />}>
                            {action === "contact" ? <Phone aria-hidden="true" className="size-4 shrink-0" /> : <HeartPulse aria-hidden="true" className="size-4 shrink-0" />}
                            <span className="min-w-0">{action === "contact" ? "Contact" : "Medical alerts"}</span>
                            {action === "medical" && detail.medicalAlerts.length > 0 && (
                                <span className="detail-status shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
                                    {detail.medicalAlerts.length}
                                </span>
                            )}
                        </DialogTrigger>
                        <DialogContent showCloseButton={false} className="student-detail-view overflow-y-auto">
                            <DialogHeader className="flex-row items-center justify-between gap-4 pr-0">
                                <DialogTitle>{action === "contact" ? "Contact details" : "Medical alerts"}</DialogTitle>
                                <DialogClose render={<Button variant="ghost" size="icon-touch" className="-my-2 -mr-2" />}>
                                    <X aria-hidden="true" /><span className="sr-only">Close</span>
                                </DialogClose>
                            </DialogHeader>
                            {action === "contact" ? <StudentContactDetails detail={detail} /> : (
                                <div className="space-y-2">
                                    {detail.medicalAlerts.length ? detail.medicalAlerts.map((alert) => (
                                        <p key={alert.id} className="detail-body rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
                                            {alert.description}
                                        </p>
                                    )) : <p className="detail-body text-sm text-muted-foreground">No active medical alerts recorded.</p>}
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>
                ))}
            </div>
            {showDetailsLink && <Link
                to={studentDetailsHref(detail.student.id, undefined, "overview")}
                className="mt-auto inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                View details
            </Link>}
        </div>
    );
}
