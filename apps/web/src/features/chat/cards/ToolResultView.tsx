import type { Property, ToolResult, ViewingSlot } from '@keyring/shared';
import { memo } from 'react';
import { MaintenanceTicketCard } from './MaintenanceTicketCard';
import { PropertyCardGrid } from './PropertyCard';
import { ViewingSlotPicker } from './ViewingSlotPicker';

export interface ToolResultActions {
  onBookViewing?: ((property: Property) => void) | undefined;
  onConfirmSlot?: ((slot: ViewingSlot, propertyTitle: string) => void) | undefined;
}

/** Renders a Zod-validated tool result as a React component — never as HTML. */
export const ToolResultView = memo(function ToolResultView({
  result,
  actions,
}: {
  result: ToolResult;
  actions?: ToolResultActions | undefined;
}) {
  switch (result.kind) {
    case 'property_cards':
      return <PropertyCardGrid properties={result.properties} onBookViewing={actions?.onBookViewing} />;
    case 'viewing_slots':
      return (
        <ViewingSlotPicker
          propertyTitle={result.propertyTitle}
          slots={result.slots}
          onConfirm={actions?.onConfirmSlot ? (slot) => actions.onConfirmSlot?.(slot, result.propertyTitle) : undefined}
        />
      );
    case 'maintenance_ticket':
      return <MaintenanceTicketCard ticket={result.ticket} />;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
});
