import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Search, CheckCircle2, AlertTriangle, Loader2, GitBranch, FileText, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import {
  PLATFORMS,
  SYSTEM_LAYERS,
  HARDWARE_COMPONENTS,
  ROOT_CAUSE_OPTIONS,
  INTERVENTION_TOOLS,
} from "@/lib/constants";

import { useCreateIncident, useSearchIncidents, getSearchIncidentsQueryKey } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { TagInput } from "@/components/ui/tag-input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  system_layers_involved: z.array(z.string()).min(1, "Select at least one system layer"),
  device_layer: z.array(z.string()).default([]),
  symptoms: z.array(z.string()).min(1, "Add at least one symptom"),
  mechanism: z.string().min(1, "Mechanism description is required"),
  root_cause_option: z.string().min(1, "Root cause is required"),
  root_cause_other: z.string().optional(),
  root_cause_notes: z.string().optional(),
  contra_present: z.array(z.string()).default([]),
  contra_absent: z.array(z.string()).default([]),
  intervention_tool: z.string().min(1, "Intervention tool is required"),
  intervention_notes: z.string().optional(),
  confidence: z.number().min(0).max(100),
});

type FormValues = z.infer<typeof formSchema>;

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function IncidentCapture() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState("new");

  const [submitResult, setSubmitResult] = React.useState<{
    id: string;
    pushed: boolean;
    push_error?: string | null;
  } | null>(null);

  const [browseQuery, setBrowseQuery] = React.useState("");
  const [activeBrowseQuery, setActiveBrowseQuery] = React.useState("");
  const [browseActive, setBrowseActive] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      platform: "",
      system_layers_involved: [],
      device_layer: [],
      symptoms: [],
      mechanism: "",
      root_cause_option: "",
      root_cause_other: "",
      root_cause_notes: "",
      contra_present: [],
      contra_absent: [],
      intervention_tool: "",
      intervention_notes: "",
      confidence: 50,
    },
  });

  const createIncident = useCreateIncident();

  // Browse: load all on tab open (empty q matches everything), filter with search
  const { data: browseResults, isLoading: isBrowseLoading } = useSearchIncidents(
    { q: activeBrowseQuery },
    { query: { enabled: browseActive, queryKey: getSearchIncidentsQueryKey({ q: activeBrowseQuery }) } }
  );

  const rootCauseOption = form.watch("root_cause_option");

  // Auto-load when switching to browse tab
  function handleTabChange(tab: string) {
    setActiveTab(tab);
    if (tab === "browse" && !browseActive) {
      setActiveBrowseQuery("");
      setBrowseActive(true);
    }
  }

  function handleBrowseSearch(e: React.FormEvent) {
    e.preventDefault();
    setActiveBrowseQuery(browseQuery.trim());
  }

  function clearBrowseSearch() {
    setBrowseQuery("");
    setActiveBrowseQuery("");
  }

  function onSubmit(data: FormValues) {
    setSubmitResult(null);

    const rootCauseBase = data.root_cause_option === "Other (describe below)"
      ? `Other: ${data.root_cause_other || "Not specified"}`
      : data.root_cause_option;
    const rootCause = data.root_cause_notes
      ? `${rootCauseBase}\n\nNotes: ${data.root_cause_notes}`
      : rootCauseBase;

    const intervention = data.intervention_notes
      ? `${data.intervention_tool} - ${data.intervention_notes}`
      : data.intervention_tool;

    const tags = Array.from(new Set([
      data.platform.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      ...data.system_layers_involved,
    ]));

    const payload = {
      platform: data.platform,
      system_layers_involved: data.system_layers_involved,
      device_layer: data.device_layer.length > 0 ? data.device_layer : undefined,
      symptoms: data.symptoms,
      mechanism: data.mechanism,
      root_cause: rootCause,
      contra_indicators: {
        present: data.contra_present,
        absent: data.contra_absent,
      },
      intervention,
      confidence: data.confidence / 100,
      tags,
    };

    createIncident.mutate(
      { data: payload },
      {
        onSuccess: (result) => {
          setSubmitResult({
            id: result.id,
            pushed: result.pushed,
            push_error: result.push_error,
          });
          form.reset();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (error) => {
          const msg = (error as unknown as { error?: string })?.error ?? "An unknown error occurred.";
          toast({
            variant: "destructive",
            title: "Failed to capture incident",
            description: msg,
          });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background pb-24 text-foreground selection:bg-primary/30">
      <div className="mx-auto max-w-[680px] p-4 sm:p-6 md:p-8">

        {/* Header */}
        <header className="mb-6 border-b border-border/50 pb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Incident Capture</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">SimonsVoss System 3060 Diagnostic Tool</p>
        </header>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="w-full mb-6 h-11">
            <TabsTrigger value="new" className="flex-1 gap-2">
              <PlusCircle className="h-4 w-4" />
              New Incident
            </TabsTrigger>
            <TabsTrigger value="browse" className="flex-1 gap-2">
              <FileText className="h-4 w-4" />
              Browse Cases
            </TabsTrigger>
          </TabsList>

          {/* ── NEW INCIDENT TAB ── */}
          <TabsContent value="new" className="space-y-0 mt-0">

            {/* Push Success Banner */}
            {submitResult && (
              <div
                className={`mb-8 rounded-lg border p-4 ${
                  submitResult.pushed
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-amber-500/30 bg-amber-500/8"
                }`}
                data-testid="alert-success"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">Incident recorded</p>
                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                      {submitResult.id}
                    </p>
                    <Separator className="my-2 opacity-30" />
                    {submitResult.pushed ? (
                      <div className="flex items-center gap-1.5 text-emerald-500">
                        <GitBranch className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Pushed to GitHub</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-amber-500">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="text-xs">
                          Saved locally — GitHub push failed:{" "}
                          <span className="font-mono opacity-80">{submitResult.push_error}</span>
                        </span>
                      </div>
                    )}
                    <button
                      className="mt-3 text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => handleTabChange("browse")}
                    >
                      View in Browse Cases →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Main Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">

                {/* Section 1: Platform */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">1</span>
                    <h2 className="text-lg font-semibold tracking-tight">Platform</h2>
                  </div>
                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-platform" className="bg-card">
                              <SelectValue placeholder="Select platform..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PLATFORMS.map((platform) => (
                              <SelectItem key={platform} value={platform}>
                                {platform}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Section 2: System Layers */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">2</span>
                    <h2 className="text-lg font-semibold tracking-tight">System Layers</h2>
                  </div>
                  <FormField
                    control={form.control}
                    name="system_layers_involved"
                    render={() => (
                      <FormItem>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {SYSTEM_LAYERS.map((layer) => (
                            <FormField
                              key={layer.id}
                              control={form.control}
                              name="system_layers_involved"
                              render={({ field }) => (
                                <FormItem
                                  key={layer.id}
                                  className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border/50 bg-card p-3 shadow-sm"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(layer.id)}
                                      onCheckedChange={(checked) =>
                                        checked
                                          ? field.onChange([...field.value, layer.id])
                                          : field.onChange(field.value?.filter((v) => v !== layer.id))
                                      }
                                      data-testid={`checkbox-layer-${layer.id}`}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="text-sm font-medium leading-none cursor-pointer">
                                      {layer.label}
                                    </FormLabel>
                                    <p className="text-[11px] text-muted-foreground font-mono">
                                      {layer.description}
                                    </p>
                                  </div>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Section 3: Hardware Components */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">3</span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Hardware Components</h2>
                      <p className="text-xs text-muted-foreground">Optional</p>
                    </div>
                  </div>
                  <FormField
                    control={form.control}
                    name="device_layer"
                    render={() => (
                      <FormItem>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[240px] overflow-y-auto p-2 border border-border/50 rounded-md bg-card/50">
                          {HARDWARE_COMPONENTS.map((hw) => (
                            <FormField
                              key={hw}
                              control={form.control}
                              name="device_layer"
                              render={({ field }) => (
                                <FormItem key={hw} className="flex flex-row items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(hw)}
                                      onCheckedChange={(checked) =>
                                        checked
                                          ? field.onChange([...field.value, hw])
                                          : field.onChange(field.value?.filter((v) => v !== hw))
                                      }
                                      data-testid={`checkbox-hw-${hw.replace(/\s+/g, "-").toLowerCase()}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-xs font-normal cursor-pointer leading-tight">
                                    {hw}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Section 4: Symptoms */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">4</span>
                    <h2 className="text-lg font-semibold tracking-tight">Symptoms</h2>
                  </div>
                  <FormField
                    control={form.control}
                    name="symptoms"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <TagInput
                            tags={field.value}
                            setTags={field.onChange}
                            placeholder="e.g. Node unresponsive, Red LED flashes..."
                            data-testid="input-symptoms"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Section 5: Mechanism */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">5</span>
                    <h2 className="text-lg font-semibold tracking-tight">Mechanism</h2>
                  </div>
                  <FormField
                    control={form.control}
                    name="mechanism"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            placeholder="How does the system fail internally? (not user-visible)"
                            className="min-h-[100px] resize-y bg-card font-mono text-sm"
                            data-testid="textarea-mechanism"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Section 6: Root Cause */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">6</span>
                    <h2 className="text-lg font-semibold tracking-tight">Root Cause</h2>
                  </div>
                  <div className="space-y-4 p-4 rounded-md border border-border/50 bg-card/30">
                    <FormField
                      control={form.control}
                      name="root_cause_option"
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-root-cause" className="bg-card">
                                <SelectValue placeholder="Select primary cause..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ROOT_CAUSE_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {rootCauseOption === "Other (describe below)" && (
                      <FormField
                        control={form.control}
                        name="root_cause_other"
                        render={({ field }) => (
                          <FormItem className="animate-in fade-in slide-in-from-top-2">
                            <FormControl>
                              <Input
                                placeholder="Describe custom root cause..."
                                className="bg-card"
                                data-testid="input-root-cause-other"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="root_cause_notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Additional observations, context, or diagnostic notes..."
                              className="bg-card min-h-[80px] resize-y text-sm"
                              data-testid="textarea-root-cause-notes"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Section 7: Contra Indicators */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">7</span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Contra Indicators</h2>
                      <p className="text-xs text-muted-foreground">Diagnostic signals</p>
                    </div>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="contra_present"
                      render={({ field }) => (
                        <FormItem className="space-y-2 p-4 rounded-md border border-border/50 bg-card/30">
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
                            Present (Rules Out)
                          </FormLabel>
                          <FormControl>
                            <TagInput
                              tags={field.value}
                              setTags={field.onChange}
                              placeholder="e.g. Ping success..."
                              data-testid="input-contra-present"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contra_absent"
                      render={({ field }) => (
                        <FormItem className="space-y-2 p-4 rounded-md border border-border/50 bg-card/30">
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            Absent (Strengthens)
                          </FormLabel>
                          <FormControl>
                            <TagInput
                              tags={field.value}
                              setTags={field.onChange}
                              placeholder="e.g. Error logs..."
                              data-testid="input-contra-absent"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Section 8: Intervention */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground font-mono">8</span>
                    <h2 className="text-lg font-semibold tracking-tight">Intervention</h2>
                  </div>
                  <div className="space-y-4 p-4 rounded-md border border-border/50 bg-card/30">
                    <FormField
                      control={form.control}
                      name="intervention_tool"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">Tool / Action</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-intervention" className="bg-card">
                                <SelectValue placeholder="Select primary intervention..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INTERVENTION_TOOLS.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="intervention_notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">Additional Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe specific parameters, versions, or steps taken..."
                              className="min-h-[80px] resize-y bg-card text-sm"
                              data-testid="textarea-intervention-notes"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Confidence Slider */}
                <section className="pt-4 border-t border-border/50">
                  <FormField
                    control={form.control}
                    name="confidence"
                    render={({ field }) => (
                      <FormItem className="space-y-4">
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-base font-semibold">Confidence in root cause</FormLabel>
                          <span className="font-mono text-sm font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                            {field.value}%
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            defaultValue={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                            data-testid="slider-confidence"
                          />
                        </FormControl>
                        <div className="flex justify-between text-xs text-muted-foreground font-mono">
                          <span>0% (Guess)</span>
                          <span>100% (Certain)</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Submit */}
                <div className="pt-6">
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-bold shadow-md"
                    disabled={createIncident.isPending}
                    data-testid="button-submit"
                  >
                    {createIncident.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Committing...
                      </>
                    ) : (
                      "Commit Incident Report"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          {/* ── BROWSE CASES TAB ── */}
          <TabsContent value="browse" className="mt-0">
            <div className="space-y-5">
              {/* Search bar */}
              <form onSubmit={handleBrowseSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={browseQuery}
                    onChange={(e) => setBrowseQuery(e.target.value)}
                    placeholder="Filter by symptom, platform, cause..."
                    className="bg-card pl-9"
                    data-testid="input-search"
                  />
                </div>
                <Button type="submit" variant="secondary" data-testid="button-search-submit">
                  Search
                </Button>
                {activeBrowseQuery && (
                  <Button type="button" variant="ghost" onClick={clearBrowseSearch} className="px-3">
                    ✕
                  </Button>
                )}
              </form>

              {/* Count / status line */}
              {!isBrowseLoading && browseResults && (
                <p className="text-xs text-muted-foreground font-mono">
                  {activeBrowseQuery
                    ? `${browseResults.total} result${browseResults.total !== 1 ? "s" : ""} for "${activeBrowseQuery}"`
                    : `${browseResults.total} incident${browseResults.total !== 1 ? "s" : ""} stored`}
                </p>
              )}

              {/* Loading */}
              {isBrowseLoading && (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading cases...</span>
                </div>
              )}

              {/* Empty */}
              {!isBrowseLoading && browseResults?.total === 0 && (
                <div className="text-center py-16 border border-dashed border-border/50 rounded-lg">
                  <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {activeBrowseQuery ? `No results for "${activeBrowseQuery}"` : "No incidents recorded yet"}
                  </p>
                </div>
              )}

              {/* Results grid */}
              {!isBrowseLoading && browseResults && browseResults.results.length > 0 && (
                <div className="grid gap-3" data-testid="search-results">
                  {browseResults.results.map((result) => (
                    <Card key={result.id} className="bg-card/50 border-border/50 hover:border-border transition-colors">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start gap-4">
                          <div className="min-w-0">
                            <CardTitle className="text-base font-semibold truncate">
                              {result.platform}
                            </CardTitle>
                            {result.created_at && (
                              <CardDescription className="text-xs mt-0.5 font-mono">
                                {new Date(result.created_at + "T00:00:00").toLocaleDateString("da-DK", {
                                  day: "2-digit", month: "short", year: "numeric"
                                })}
                              </CardDescription>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${
                              result.confidence >= 0.75
                                ? "bg-emerald-500/15 text-emerald-400"
                                : result.confidence >= 0.5
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-red-500/15 text-red-400"
                            }`}>
                              {Math.round(result.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 space-y-3">
                        {/* Confidence bar */}
                        <ConfidenceBar value={result.confidence} />

                        {/* Snippet */}
                        {result.snippet && (
                          <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3 py-0.5 italic">
                            "{result.snippet}"
                          </p>
                        )}

                        {/* System layers */}
                        {result.system_layers_involved && result.system_layers_involved.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.system_layers_involved.map((layer) => (
                              <Badge key={layer} variant="secondary" className="text-[10px] font-mono">
                                {layer}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Tags */}
                        {result.tags && result.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.tags.slice(0, 5).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px] font-mono opacity-70">
                                {tag}
                              </Badge>
                            ))}
                            {result.tags.length > 5 && (
                              <Badge variant="outline" className="text-[10px] font-mono opacity-50">
                                +{result.tags.length - 5}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* File path */}
                        <p className="text-[10px] font-mono text-muted-foreground/50 truncate">
                          {result.file_path}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
