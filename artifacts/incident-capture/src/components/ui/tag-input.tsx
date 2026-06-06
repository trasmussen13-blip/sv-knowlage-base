import * as React from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "./badge";
import { Input } from "./input";
import { Button } from "./button";

interface TagInputProps {
  placeholder?: string;
  tags: string[];
  setTags: (tags: string[]) => void;
  "data-testid"?: string;
}

export function TagInput({ placeholder, tags, setTags, "data-testid": testId }: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");

  const handleAddTag = () => {
    if (inputValue.trim() && !tags.includes(inputValue.trim())) {
      setTags([...tags, inputValue.trim()]);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Add item..."}
          className="flex-1"
          data-testid={testId ? `${testId}-input` : "tag-input"}
        />
        <Button 
          type="button" 
          variant="secondary" 
          onClick={handleAddTag}
          data-testid={testId ? `${testId}-add-btn` : "tag-add-btn"}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="px-2 py-1 gap-1 text-sm font-normal">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-muted-foreground hover:text-foreground focus:outline-none"
                data-testid={testId ? `${testId}-remove-${tag}` : `tag-remove-${tag}`}
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Remove {tag}</span>
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
